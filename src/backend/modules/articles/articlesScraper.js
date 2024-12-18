import { createLogger } from '../../utils/logger.js';
import { pool } from '../../utils/dbCon.js';
import { sendToModel } from '../../utils/ollama.js';
import trueNorth from './scrapers/trueNorth.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('articles-scraper');

class ArticlesScraper {
    constructor() {
        // Map of base URLs to their respective scrapers
        this.scrapers = new Map([
            ['tnc.news', trueNorth]
        ]);
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
     * Update article content in database
     * @param {string} table - Articles table name
     * @param {number} id - Article ID
     * @param {string} content - Article content
     */
    async updateArticleContent(table, id, content) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
                UPDATE ${table}
                SET content = $1
                WHERE id = $2`,
                [content, id]
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
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
            logger.info(`Skipping article ${article.title} - no scraper available`);
            return;
        }

        try {
            logger.info(`Starting to process article: ${article.title}`);
            
            // Scrape the article
            const htmlContent = await scraper.scrape(article.url, article);
            
            // Handle video content
            if (htmlContent === 'Video Content') {
                logger.info(`Article is video content: ${article.title}`);
                await this.updateArticleContent(tableName, article.id, 'Video Content');
                return;
            }
            
            logger.info(`Got HTML content for ${article.title}, length: ${htmlContent?.length || 0}`);
            
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

            logger.info(`Generated markdown content for ${article.title}, length: ${markdownContent.length}`);
            
            // Update the article with markdown content
            await this.updateArticleContent(tableName, article.id, markdownContent);
            logger.info(`Successfully updated article content: ${article.title}`);
        } catch (error) {
            logger.error(`Failed to process article: ${article.title}`, error);
        }
    }

    /**
     * Process articles from a feed
     * @param {Array} articles - Array of articles
     * @param {string} tableName - Articles table name
     */
    async processFeed(articles, tableName) {
        logger.info(`Processing ${articles.length} articles from ${tableName}`);
        
        // Process one article at a time
        for (const article of articles) {
            await this.processArticle(article, tableName);
        }
    }

    /**
     * Process feeds data
     * @param {Array} feedsData - Array of feed data objects
     */
    async processFeeds(feedsData) {
        try {
            logger.info(`Starting to process ${feedsData.length} feeds`);
            
            for (const feed of feedsData) {
                await this.processFeed(feed.articles, feed.source.articles_table);
            }

            logger.info('Completed processing all feeds');
        } catch (error) {
            logger.error('Error processing feeds:', error);
            throw error;
        }
    }
}

export default new ArticlesScraper(); 