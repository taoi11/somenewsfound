import winston from 'winston';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const env = process.env.DEPLOYMENT_ENV || 'development';

// Create logger configuration
export function createLogger(module) {
    // Set log level based on environment
    const logLevel = env === 'development' ? 'debug' : 'info';
    
    // Create base logger configuration
    const logger = winston.createLogger({
        level: logLevel,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        defaultMeta: { 
            service: module,
            environment: env
        }
    });

    // Add console transport in development
    if (env === 'development') {
        logger.add(new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(({ level, message, timestamp, service }) => {
                    return `${timestamp} [${service}] ${level}: ${message}`;
                })
            )
        }));
    }

    // Add file transports
    logger.add(new winston.transports.File({ 
        filename: `logs/${env}/error.log`,
        level: 'error'
    }));
    
    logger.add(new winston.transports.File({ 
        filename: `logs/${env}/combined.log`
    }));

    // Log initialization
    logger.debug(`Logger initialized for ${module} in ${env} environment`);
    
    return logger;
} 