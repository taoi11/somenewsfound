import { createLogger } from '../../utils/logger.js';
import { pool } from '../../utils/dbCon.js';
import { sendToModel } from '../../utils/ollama.js';
import trueNorth from './scrapers/trueNorth.js';
import cbc from './scrapers/cbc.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('articles-scraper');

class ArticlesScraper {
    constructor() {
        // Map of base URLs to their respective scrapers
        this.scrapers = new Map([
            ['tnc.news', trueNorth],
            ['cbc.ca', cbc]
        ]);
    }

    /**
     * Get all article tables from the database
     * @returns {Promise<Array<string>>} List of article table names
     */
    async getArticleTables() {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT articles_table 
                FROM sources 
                ORDER BY channel_name
            `);
            return result.rows.map(row => row.articles_table);
        } finally {
            client.release();
        }
    }

    /**
     * Get unprocessed articles from a table
     * @param {string} tableName - Name of the articles table
     * @returns {Promise<Array>} List of unprocessed articles
     */
    async getUnprocessedArticles(tableName) {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT id, url, title 
                FROM ${tableName}
                WHERE content IS NULL
                ORDER BY date_added DESC
                LIMIT 5
            `);
            return result.rows;
        } finally {
            client.release();
        }
    }

    /**
     * Convert HTML to markdown using Ollama
     * @param {string} html - HTML content to convert
     * @returns {Promise<string>} Markdown content
     */
    async convertToMarkdown(html) {
        try {
            const markdownContent = await sendToModel(
                process.env.OLLAMA_HTML_READER,
                html,
                {
                    num_ctx: parseInt(process.env.OLLAMA_HTML_READER_NUM_CTX)
                }
            );
            return markdownContent;
        } catch (error) {
            logger.error('Failed to convert HTML to markdown:', error);
            return html; // Return original HTML on error
        }
    }

    /**
     * Get the appropriate scraper for a URL
     * @param {string} url - The article URL to scrape
     * @returns {Object|null} The scraper object or null if no matching scraper
     */
    getScraperForUrl(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            
            // Try to find a matching scraper
            for (const [baseUrl, scraper] of this.scrapers) {
                if (hostname.includes(baseUrl)) {
                    logger.debug(`Found scraper for ${hostname}`);
                    return scraper;
                }
            }

            logger.info(`No scraper found for hostname: ${hostname}`);
            return null;
        } catch (error) {
            logger.error(`Invalid or malformed URL: ${url}`, error);
            return null;
        }
    }

    /**
     * Process a single article
     * @param {Object} article - Article data
     * @param {string} tableName - Articles table name
     */
    async processArticle(article, tableName) {
        const scraper = this.getScraperForUrl(article.url);
        if (!scraper) {
            logger.debug(`No scraper available for: ${article.title}`);
            return;
        }

        try {
            logger.debug(`Processing article: ${article.title}`);
            
            // Scrape the article
            const htmlContent = await scraper.scrape(article.url, article);
            
            // Handle video content
            if (htmlContent === 'Video Content') {
                logger.debug(`Video content: ${article.title}`);
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    await client.query(`
                        UPDATE ${tableName}
                        SET content = $1
                        WHERE id = $2`,
                        ['Video Content', article.id]
                    );
                    await client.query('COMMIT');
                    logger.debug(`Updated video content: ${article.title}`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    throw error;
                } finally {
                    client.release();
                }
                return;
            }
            
            logger.debug(`Got HTML content for ${article.title}, length: ${htmlContent?.length || 0}`);
            
            if (!htmlContent) {
                logger.warn(`No HTML content returned for article: ${article.title}`);
                return;
            }

            // Convert HTML to Markdown
            const markdownContent = await this.convertToMarkdown(htmlContent);
            
            if (!markdownContent) {
                logger.warn(`No markdown content generated for article: ${article.title}`);
                return;
            }

            logger.debug(`Generated markdown content for ${article.title}, length: ${markdownContent.length}`);
            
            // Update the article with markdown content
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`
                    UPDATE ${tableName}
                    SET content = $1
                    WHERE id = $2`,
                    [markdownContent, article.id]
                );
                await client.query('COMMIT');
                logger.debug(`Updated article content: ${article.title}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            logger.error(`Failed to process article: ${article.title}`, error);
        }
    }

    /**
     * Process all unprocessed articles in a table
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
            
            // Process one article at a time
            for (const article of articles) {
                await this.processArticle(article, tableName);
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
            logger.info('Starting article processing');
            
            const tables = await this.getArticleTables();
            logger.debug(`Found ${tables.length} article tables`);
            
            // Process one table at a time
            for (const table of tables) {
                await this.processTable(table);
            }

            logger.info('Completed article processing');
        } catch (error) {
            logger.error('Error processing tables:', error);
        }
    }
}

export default new ArticlesScraper(); 