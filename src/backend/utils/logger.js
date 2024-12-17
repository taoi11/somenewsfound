import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

// Create logger for a specific module
export const createLogger = (module) => {
    return winston.createLogger({
        level: process.env.DEPLOYMENT_ENV === 'production' ? 'info' : 'debug',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        defaultMeta: { service: module },
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.timestamp(),
                    winston.format.printf(
                        info => `${info.timestamp} [${info.service}] ${info.level}: ${info.message}`
                    )
                )
            })
        ]
    });
}; 