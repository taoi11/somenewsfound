import { createLogger } from '../../utils/logger.js';
import { pool } from '../../utils/dbCon.js';

const logger = createLogger('articles-fetch');

class ArticlesFetch {
    constructor() {
        this.sources = [];
    }

    /**
     * Initialize with sources data
     * @param {Array<{url: string, channel_name: string, articles_table: string}>} sources
     */
    async initialize(sources) {
        try {
            this.sources = sources;
            logger.info(`Initialized ArticlesFetch with ${sources.length} sources`);
            return true;
        } catch (error) {
            logger.error('Failed to initialize ArticlesFetch:', error);
            throw error;
        }
    }

    /**
     * Process articles for a specific source
     * @param {Object} source - Source information
     * @param {Array} articles - Articles to process
     */
    async processArticles(source, articles) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Insert articles into source-specific articles table
            const articleQuery = `
                INSERT INTO ${source.articles_table} (url, title, date_added, scrape_check)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (url) DO UPDATE
                SET title = EXCLUDED.title,
                    date_added = EXCLUDED.date_added,
                    scrape_check = EXCLUDED.scrape_check
                RETURNING id`;

            for (const article of articles) {
                const result = await client.query(articleQuery, [
                    article.url,
                    article.title,
                    article.date_added,
                    0 // Initial scrape_check value
                ]);
                logger.debug(`Processed article: ${article.title} for ${source.channel_name}`);
            }

            await client.query('COMMIT');
            logger.info(`Successfully processed ${articles.length} articles for ${source.channel_name}`);
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Failed to process articles for ${source.channel_name}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Main process to fetch and store articles
     * @param {Array} feedData - Array of feed data objects
     */
    async processFeeds(feedData) {
        try {
            logger.info(`Starting to process ${feedData.length} feeds`);
            
            for (const feed of feedData) {
                await this.processArticles(feed.source, feed.articles);
            }

            logger.info('All feeds processed successfully');
            return true;
        } catch (error) {
            logger.error('Failed to process feeds:', error);
            throw error;
        }
    }
}

export default new ArticlesFetch(); 