import { createLogger } from '../../utils/logger.js';
import { pool } from '../../utils/dbCon.js';

const logger = createLogger('articles-fetch');

class ArticlesFetch {
    constructor() {
        this.sources = [];
        this.processedArticles = new Map(); // Track processed articles by table
    }

    /**
     * Initialize with sources data
     * @param {Array<{url: string, channel_name: string, articles_table: string}>} sources
     */
    async initialize(sources) {
        try {
            this.sources = sources;
            this.processedArticles.clear();
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

            // Track articles for this table
            if (!this.processedArticles.has(source.articles_table)) {
                this.processedArticles.set(source.articles_table, []);
            }
            const tableArticles = this.processedArticles.get(source.articles_table);

            // Insert articles into source-specific articles table
            const articleQuery = `
                INSERT INTO ${source.articles_table} (url, title, date_added)
                VALUES ($1, $2, $3)
                ON CONFLICT (url) DO UPDATE
                SET title = EXCLUDED.title,
                    date_added = EXCLUDED.date_added
                RETURNING id, title`;

            for (const article of articles) {
                const result = await client.query(articleQuery, [
                    article.url,
                    article.title,
                    article.date_added
                ]);
                
                // Add to processed articles list
                if (result.rows[0]) {
                    tableArticles.push({
                        id: result.rows[0].id,
                        url: article.url,
                        title: result.rows[0].title,
                        contentEncoded: article.contentEncoded,
                        content: article.content,
                        categories: article.categories
                    });
                }
                
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
     * Get processed articles data
     * @returns {Array} Array of feed data with processed articles
     */
    getProcessedFeeds() {
        return Array.from(this.processedArticles.entries()).map(([articles_table, articles]) => ({
            source: { articles_table },
            articles
        }));
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

            const processedFeeds = this.getProcessedFeeds();
            logger.info('All feeds processed successfully');
            return processedFeeds;
        } catch (error) {
            logger.error('Failed to process feeds:', error);
            throw error;
        }
    }
}

export default new ArticlesFetch(); 