import rssReader from './backend/modules/articles/rssReader.js';
import articlesScraper from './backend/modules/articles/articlesScrape.js';
import { createLogger } from './backend/utils/logger.js';
import { initializeDatabase } from './backend/utils/dbCon.js';

const logger = createLogger('worker');

// Feed URLs
const feedUrls = [
    'https://tnc.news/feed/',
    'https://www.cbc.ca/cmlink/rss-topstories'
];

// Sleep function (returns a promise that resolves after ms milliseconds)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function feedWorker() {
    try {
        logger.info('Starting RSS feed worker');
        
        // Initialize database
        await initializeDatabase();
        logger.info('Database initialized');

        // Initialize and run RSS reader
        await rssReader.initialize(feedUrls);
        await rssReader.processFeedSources();
        
        logger.info('Feed processing completed');

        // Process articles content
        await articlesScraper.processAllTables();
        logger.info('Article processing completed');
    } catch (error) {
        logger.error('Worker failed:', error.message);
    }
}

// Run worker in a loop with 60-minute intervals
async function runWorkerLoop() {
    while (true) {
        await feedWorker();
        logger.info('Worker sleeping for 60 minutes...');
        await sleep(60 * 60 * 1000); // 60 minutes in milliseconds
    }
}

// Start the worker loop
runWorkerLoop();
