import { createLogger } from './logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createLogger('ollama');

// Configure Ollama host
if (!process.env.OLLAMA_HOST) {
    logger.error('OLLAMA_HOST environment variable is not set');
    throw new Error('OLLAMA_HOST environment variable is required');
}

const OLLAMA_HOST = process.env.OLLAMA_HOST;
logger.info(`Ollama host configured: ${OLLAMA_HOST}`);

/**
 * Make a POST request to Ollama API
 * @param {string} endpoint - API endpoint
 * @param {Object} body - Request body
 * @returns {Promise<Object>} Response data
 */
async function ollamaRequest(endpoint, body) {
    try {
        const response = await fetch(`${OLLAMA_HOST}/api/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        logger.error(`Ollama API request failed (${endpoint}):`, error.message);
        throw error;
    }
}

/**
 * Send request to Ollama model
 * @param {string} model - Model name to use
 * @param {string} content - Content to process
 * @param {Object} options - Additional options
 * @returns {Promise<string>} Processed content
 */
async function sendToModel(model, content, options = {}) {
    if (!model) {
        logger.error('Model name is required');
        throw new Error('Model name is required');
    }

    if (!content) {
        logger.error('Content is required');
        throw new Error('Content is required');
    }

    try {
        logger.info(`Sending request to Ollama model: ${model}`);
        logger.debug(`Request options: ${JSON.stringify(options)}`);
        
        const requestBody = {
            model,
            messages: [
                {
                    role: 'system',
                    content: 'Convert the following HTML content to clean, readable markdown. Preserve important formatting but remove unnecessary HTML elements.'
                },
                {
                    role: 'user',
                    content
                }
            ],
            stream: false,
            options: {
                num_ctx: options.num_ctx
            }
        };

        const response = await ollamaRequest('chat', requestBody);

        if (!response?.message?.content) {
            logger.error('No content in Ollama response');
            throw new Error('No content in Ollama response');
        }

        logger.info(`Successfully received response from Ollama model: ${model}`);
        return response.message.content;
    } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        logger.error(`Failed to process content with ${model}: ${errorMessage}`);
        throw error;
    }
}

export { sendToModel }; 