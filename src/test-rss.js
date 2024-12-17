import rssReader from './backend/modules/articles/rssReader.js';
import { createLogger } from './backend/utils/logger.js';

const logger = createLogger('test-rss');

// Test URLs
const testUrls = [
    'https://hnrss.org/frontpage',
    'https://feeds.feedburner.com/TechCrunch'
];

async function testRssReader() {
    try {
        // Initialize RSS reader
        await rssReader.initialize(testUrls);
        
        // Process feeds
        await rssReader.processFeedSources();
        
        logger.info('RSS test completed successfully');
    } catch (error) {
        logger.error('RSS test failed:', error);
    }
}

// Run the test
testRssReader(); 