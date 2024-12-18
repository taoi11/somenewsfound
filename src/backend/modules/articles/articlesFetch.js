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
                INSERT INTO ${source.articles_table} 
                (url, title, date_added, scrape_check)
                VALUES ($1, $2, $3, 0)
                ON CONFLICT (url) DO UPDATE
                SET title = EXCLUDED.title,
                    date_added = EXCLUDED.date_added,
                    scrape_check = 0
                RETURNING id, title`;

            for (const article of articles) {
                await client.query(articleQuery, [
                    article.url,
                    article.title,
                    article.date_added
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
     * Process feeds data
     * @param {Array} feedData - Array of feed data objects
     */
    async processFeeds(feedData) {
        try {
            logger.info(`Starting to process ${feedData.length} feeds`);
            
            for (const feed of feedData) {
                await this.processArticles(feed.source, feed.articles);
            }

            logger.info('All feeds processed successfully');
        } catch (error) {
            logger.error('Failed to process feeds:', error);
            throw error;
        }
    }

    /**
     * Process articles from a table
     * @param {string} tableName - Name of the articles table
     */
    async processTable(tableName) {
        try {
            logger.debug(`Processing articles from table: ${tableName}`);
            const articles = await this.getUnprocessedArticles(tableName);
            
            if (articles.length === 0) {
                logger.debug(`No unprocessed articles in ${tableName}`);
                return;
            }

            logger.info(`Found ${articles.length} unprocessed articles in ${tableName}`);
            
            // Process each article
            for (const article of articles) {
                try {
                    await this.processArticle(article, tableName);
                } catch (error) {
                    logger.error(`Error processing article in ${tableName}:`, error);
                }
            }

            logger.debug(`Completed processing articles from ${tableName}`);
        } catch (error) {
            logger.error(`Error processing table ${tableName}:`, error);
        }
    }

    /**
     * Process all article tables
     */
    async processAllTables() {
        try {
            logger.info('Starting article fetch processing');
            
            const tables = await this.getArticleTables();
            logger.debug(`Found ${tables.length} article tables`);
            
            // Process each table
            for (const table of tables) {
                await this.processTable(table);
            }

            logger.info('Completed article fetch processing');
        } catch (error) {
            logger.error('Error processing tables:', error);
        }
    }
}

export default new ArticlesFetch(); 