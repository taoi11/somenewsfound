import Parser from 'rss-parser';
import { createLogger } from '../../utils/logger.js';
import { pool } from '../../utils/dbCon.js';
import articlesFetch from './articlesFetch.js';
import articlesScraper from './articlesScraper.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('rss-reader');

// Configure parser with simple XML parsing
const parser = new Parser({
    defaultRSS: 2.0,
    customFields: {
        item: [
            ['content:encoded', 'contentEncoded'],
            ['dc:creator', 'dcCreator'],
            ['category', 'categories']
        ]
    },
    requestOptions: {
        rejectUnauthorized: false
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
        if (!title) return 'Untitled';
        return title
            .replace(/<!\[CDATA\[|\]\]>/g, '') // Remove CDATA tags
            .replace(/&#124;/g, '') // Remove HTML-encoded pipe character
            .replace(/\|/g, '') // Remove pipe character
            .trim(); // Remove extra whitespace
    }

    /**
     * Sanitize string for table name
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string for table name
     */
    sanitizeTableName(str) {
        return str
            .toLowerCase()
            .replace(/\|/g, '') // Remove pipe characters
            .replace(/&#124;/g, '') // Remove HTML-encoded pipe character
            .replace(/[^a-z0-9]/g, '_') // Replace other special chars with underscore
            .replace(/_+/g, '_') // Replace multiple underscores with single
            .replace(/^_|_$/g, '') // Remove leading/trailing underscores
            .trim();
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
            const articlesTable = `articles_${this.sanitizeTableName(channelName)}`;

            // Extract source information
            const source = {
                url: feedUrl,
                channel_name: channelName,
                articles_table: articlesTable
            };

            // Extract articles information
            const articles = feed.items.map(item => ({
                url: item.link,
                title: this.cleanTitle(item.title),
                date_added: new Date(item.pubDate || item.dcDate),
                categories: item.categories,
                contentEncoded: item.contentEncoded,
                content: item.content || item.description
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

            // Create articles table for this source if it doesn't exist
            const createArticlesTableQuery = `
                CREATE TABLE IF NOT EXISTS ${feedData.source.articles_table} (
                    id BIGSERIAL PRIMARY KEY,
                    url TEXT NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    date_added TIMESTAMP NOT NULL,
                    categories TEXT[],
                    content TEXT,
                    content_encoded TEXT,
                    processed BOOLEAN DEFAULT FALSE,
                    processed_at TIMESTAMP,
                    error TEXT,
                    markdown TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`;
            await client.query(createArticlesTableQuery);

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
            logger.info(`Source and articles table stored successfully: ${feedData.source.channel_name}`);
            
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
     * Process RSS feed content
     * @param {string} url - Article URL
     * @returns {Promise<string>} Article content
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
            const processedArticles = await articlesFetch.processFeeds(this.processedFeeds);

            // Process articles content if any new/updated articles
            if (processedArticles.length > 0) {
                await articlesScraper.processFeeds(processedArticles);
            }

            logger.info('RSS processing completed successfully');
        } catch (error) {
            logger.error('RSS processing failed:', error);
            throw error;
        }
    }
}

export default new RSSReader();
