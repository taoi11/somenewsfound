import pkg from 'pg';
const { Pool } = pkg;
import { createLogger } from './logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('database');

// Database connection configuration
const dbConfig = {
    connectionString: process.env.DB_URL,
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    ssl: {
        rejectUnauthorized: false // Required for some cloud databases
    }
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err, client) => {
    logger.error('Unexpected error on idle client:', err);
});

// Test database connection
const testConnection = async () => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        logger.info('Database connection established successfully:', result.rows[0].now);
        client.release();
        return true;
    } catch (error) {
        logger.error('Failed to establish database connection:', error);
        throw error;
    }
};

// Initialize database connection
const initializeDatabase = async () => {
    try {
        await testConnection();
        return pool;
    } catch (error) {
        logger.error('Database initialization failed:', error);
        throw error;
    }
};

export { pool, initializeDatabase }; 