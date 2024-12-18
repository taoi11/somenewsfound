import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('cbc-scraper');

class CBCNewsScraper {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    }

    /**
     * Clean URL by removing query parameters
     * @param {string} url - Original URL
     * @returns {string} Cleaned URL
     */
    cleanUrl(url) {
        try {
            return url.split('?')[0];
        } catch (error) {
            logger.error('Failed to clean URL:', error);
            return url;
        }
    }

    /**
     * Extract main content from HTML
     * @param {string} html - Raw HTML content
     * @returns {string} Content within main#content and div#detailContent
     */
    extractMainContent(html) {
        try {
            // First find the main content section
            const mainStart = html.indexOf('<main');
            if (mainStart === -1) {
                // If main tag not found, look for alternatives
                const contentDiv = html.indexOf('id="content"');
                if (contentDiv !== -1) {
                    logger.debug('Found content div instead of main tag');
                    const snippet = html.substring(contentDiv - 50, contentDiv + 100);
                    logger.debug(`Content structure: ${snippet}`);
                }
                return null;
            }

            // Find the end of the main tag
            const mainTagEnd = html.indexOf('>', mainStart) + 1;
            
            // Find the closing main tag
            let depth = 1;
            let mainEnd = mainTagEnd;
            
            while (depth > 0 && mainEnd < html.length) {
                const closeTag = html.indexOf('</main>', mainEnd);
                const openTag = html.indexOf('<main', mainEnd);
                
                if (closeTag === -1) {
                    logger.warn('No closing main tag found');
                    return null;
                }
                
                if (openTag === -1 || closeTag < openTag) {
                    depth--;
                    mainEnd = closeTag + 7; // length of </main>
                } else {
                    depth++;
                    mainEnd = openTag + 5; // length of <main
                }
            }

            const mainContent = html.substring(mainTagEnd, mainEnd - 7);

            // Now find the detail content div within main
            const detailStart = mainContent.indexOf('<div id="detailContent"');
            if (detailStart === -1) {
                // Look for alternative content containers
                const storyContent = mainContent.indexOf('class="story-content"');
                if (storyContent !== -1) {
                    logger.debug('Found story-content div instead of detailContent');
                    return mainContent;
                }
                return mainContent;
            }

            // Find the end of the div tag
            const divTagEnd = mainContent.indexOf('>', detailStart) + 1;
            
            // Find the closing div tag
            depth = 1;
            let divEnd = divTagEnd;
            
            while (depth > 0 && divEnd < mainContent.length) {
                const closeTag = mainContent.indexOf('</div>', divEnd);
                const openTag = mainContent.indexOf('<div', divEnd);
                
                if (closeTag === -1) {
                    logger.warn('No closing div tag found');
                    return mainContent;
                }
                
                if (openTag === -1 || closeTag < openTag) {
                    depth--;
                    divEnd = closeTag + 6; // length of </div>
                } else {
                    depth++;
                    divEnd = openTag + 4; // length of <div
                }
            }

            return mainContent.substring(divTagEnd, divEnd - 6);
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
            const cleanedUrl = this.cleanUrl(url);
            logger.debug(`Fetching article: ${cleanedUrl}`);

            // Fetch the article HTML with custom headers
            const response = await fetch(cleanedUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Cache-Control': 'max-age=0'
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

export default new CBCNewsScraper(); 