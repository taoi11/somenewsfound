import Parser from 'rss-parser';
import { createLogger } from '../../utils/logger.js';
import { pool } from '../../utils/dbCon.js';
import articlesFetch from './articlesFetch.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('rss-reader');
const parser = new Parser({
    defaultRSS: 2.0,
    xml2js: {
        // Handle CDATA properly
        xmlMode: true,
        normalize: true
    }
});

// Handles RSS feed processing operations
class RSSReader {
    constructor() {
        this.sourceUrls = [];
        this.processedFeeds = [];
    }

    /**
     * Initialize RSS reader with source URLs and database connection
     * @param {Array<string>} urls - List of RSS feed URLs
     */
    async initialize(urls) {
        try {
            logger.info(`Initializing RSS reader with ${urls.length} sources`);
            this.sourceUrls = urls;
            this.processedFeeds = [];
            
            // Test database connection and create sources table
            await this.testDatabaseConnection();
            
            return true;
        } catch (error) {
            logger.error('Failed to initialize RSS reader:', error);
            throw error;
        }
    }

    /**
     * Test database connection and create sources table
     */
    async testDatabaseConnection() {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create sources table if not exists
            await client.query(`
                CREATE TABLE IF NOT EXISTS sources (
                    id BIGSERIAL PRIMARY KEY,
                    url TEXT NOT NULL UNIQUE,
                    channel_name TEXT NOT NULL,
                    articles_table TEXT NOT NULL UNIQUE
                )`);

            await client.query('COMMIT');
            logger.info('Database connection verified and sources table created');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Database connection test failed:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Clean title from CDATA and extra whitespace
     * @param {string} title - Raw title from feed
     * @returns {string} Cleaned title
     */
    cleanTitle(title) {
        return title
            .replace(/<!\[CDATA\[|\]\]>/g, '') // Remove CDATA tags
            .trim(); // Remove extra whitespace
    }

    /**
     * Sanitize string for use as table name
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string
     */
    sanitizeTableName(str) {
        return `articles_${str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_') // Replace any non-alphanumeric char with underscore
            .replace(/_+/g, '_') // Replace multiple underscores with single
            .replace(/^_|_$/g, '') // Remove leading/trailing underscores
            .trim()}`;
    }

    /**
     * Create articles table for a source if it doesn't exist
     * @param {string} tableName - Name of the table to create
     */
    async createArticlesTable(tableName) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create articles table if not exists
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS ${tableName} (
                    id BIGSERIAL PRIMARY KEY,
                    url TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    date_added TIMESTAMP NOT NULL,
                    scrape_check INTEGER DEFAULT 0,
                    content TEXT,
                    summary TEXT
                )`;
            
            await client.query(createTableQuery);
            await client.query('COMMIT');
            logger.info(`Created articles table: ${tableName}`);
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Failed to create articles table ${tableName}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Pulls and parses RSS feed from given URL
     * @param {string} feedUrl - URL of the RSS feed
     * @returns {Promise<{source: Object, articles: Array}>}
     */
    async pullAndParseFeed(feedUrl) {
        try {
            logger.info(`Pulling RSS feed from: ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);
            
            const channelName = this.cleanTitle(feed.title || 'Unknown Channel');
            const articlesTable = this.sanitizeTableName(channelName);

            // Extract source information
            const source = {
                url: feedUrl,
                channel_name: channelName,
                articles_table: articlesTable
            };

            // Create articles table for this source
            await this.createArticlesTable(articlesTable);

            // Extract articles information
            const articles = feed.items.map(item => ({
                url: item.link,
                title: this.cleanTitle(item.title),
                date_added: new Date(item.pubDate),
                scrape_check: 0 // Initialize as not scraped
            }));

            logger.info(`Successfully parsed ${articles.length} articles from ${source.channel_name}`);
            return { source, articles };
        } catch (error) {
            logger.error(`Failed to pull/parse RSS feed from ${feedUrl}:`, error);
            throw error;
        }
    }

    /**
     * Stores feed source in the database
     * @param {Object} feedData - Parsed feed data
     */
    async storeFeedSource(feedData) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Insert or update source
            const sourceQuery = `
                INSERT INTO sources (url, channel_name, articles_table)
                VALUES ($1, $2, $3)
                ON CONFLICT (url) DO UPDATE
                SET channel_name = EXCLUDED.channel_name,
                    articles_table = EXCLUDED.articles_table
                RETURNING id`;
            const sourceResult = await client.query(sourceQuery, [
                feedData.source.url,
                feedData.source.channel_name,
                feedData.source.articles_table
            ]);

            await client.query('COMMIT');
            logger.info(`Source stored successfully: ${feedData.source.channel_name}`);
            
            // Add to processed feeds for articlesFetch
            this.processedFeeds.push(feedData);
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to store feed source:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Main process to fetch and store RSS feeds
     */
    async processFeedSources() {
        try {
            if (!this.sourceUrls.length) {
                throw new Error('No RSS sources configured');
            }

            logger.info(`Processing ${this.sourceUrls.length} RSS sources`);
            
            // Clear processed feeds array
            this.processedFeeds = [];
            
            // Process each feed
            for (const url of this.sourceUrls) {
                const feedData = await this.pullAndParseFeed(url);
                await this.storeFeedSource(feedData);
            }

            // Initialize and run articlesFetch with processed feeds
            await articlesFetch.initialize(this.processedFeeds.map(feed => feed.source));
            await articlesFetch.processFeeds(this.processedFeeds);

            logger.info('RSS processing completed successfully');
        } catch (error) {
            logger.error('RSS processing failed:', error);
            throw error;
        }
    }
}

export default new RSSReader();
