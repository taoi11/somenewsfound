import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('trueNorth-scraper');

class trueNorthNewsScraper {
    constructor() {
        this.name = 'trueNorth News Scraper';
    }

    /**
     * Check if content is a podcast or video
     * @param {Array} categories - Article categories
     * @returns {boolean} True if content is video/podcast
     */
    isVideoContent(categories) {
        if (!Array.isArray(categories)) {
            categories = [categories];
        }

        return categories.some(category => 
            category === 'Podcasts' || category === 'Videos'
        );
    }

    /**
     * Process article content
     * @param {string} url - Article URL (for logging)
     * @param {Object} article - Article data with contentEncoded and categories
     * @returns {Promise<string>} Article content
     */
    async scrape(url, article) {
        try {
            logger.info(`Processing article: ${article.title}`);

            // Check for special content types
            if (article.categories && this.isVideoContent(article.categories)) {
                logger.info(`Video content found: ${article.title}`);
                return 'Video Content';
            }

            // For non-video content, return the entire content:encoded content
            if (article.contentEncoded) {
                logger.info(`Successfully extracted content from: ${article.title}`);
                return article.contentEncoded;
            }

            logger.info(`No content found for article: ${article.title}, checking raw content`);
            
            // If no contentEncoded, try using raw content if available
            if (article.content) {
                return article.content;
            }

            throw new Error(`No content available for article: ${article.title}`);
        } catch (error) {
            logger.error(`Failed to process article: ${article.title}`, error);
            throw error;
        }
    }
}

export default new trueNorthNewsScraper(); 