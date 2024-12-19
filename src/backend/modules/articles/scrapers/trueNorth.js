import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('trueNorth-scraper');

class trueNorthNewsScraper {
    constructor() {
        this.name = 'trueNorth News Scraper';
        this.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    }

    /**
     * Extract main content from HTML
     * @param {string} html - Raw HTML content
     * @returns {string} Content within main content div
     */
    extractMainContent(html) {
        try {
            // Find the div with role="main"
            const mainDivStart = html.indexOf('role="main"');
            if (mainDivStart === -1) {
                logger.debug('Main content div not found');
                return null;
            }

            // Find the start of the div tag
            const divStart = html.lastIndexOf('<div', mainDivStart);
            if (divStart === -1) {
                logger.debug('Opening div tag not found');
                return null;
            }

            // Find the end of the div tag
            const divTagEnd = html.indexOf('>', divStart) + 1;
            
            // Find the closing div tag
            let depth = 1;
            let divEnd = divTagEnd;
            
            while (depth > 0 && divEnd < html.length) {
                const closeTag = html.indexOf('</div>', divEnd);
                const openTag = html.indexOf('<div', divEnd);
                
                if (closeTag === -1) {
                    logger.warn('No closing div tag found');
                    return null;
                }
                
                if (openTag === -1 || closeTag < openTag) {
                    depth--;
                    divEnd = closeTag + 6; // length of </div>
                } else {
                    depth++;
                    divEnd = openTag + 4; // length of <div
                }
            }

            const content = html.substring(divTagEnd, divEnd - 6);
            if (!content) {
                logger.warn('No content found within main div');
                return null;
            }

            return content;
        } catch (error) {
            logger.error('Failed to extract main content:', error);
            return null;
        }
    }

    /**
     * Process article content
     * @param {string} url - Article URL
     * @param {Object} article - Article data
     * @returns {Promise<string>} Article content
     */
    async scrape(url, article) {
        try {
            logger.debug(`Fetching article: ${article.title}`);

            // Fetch the article HTML with user agent
            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const html = await response.text();
            
            // Extract main content
            const content = this.extractMainContent(html);
            
            if (!content) {
                throw new Error('No content extracted from HTML');
            }

            logger.debug(`Extracted content from: ${article.title}`);
            return content;

        } catch (error) {
            logger.error(`Failed to process article: ${article.title}`, error);
            throw error;
        }
    }
}

export default new trueNorthNewsScraper(); 