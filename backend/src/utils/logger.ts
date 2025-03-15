// backend/src/utils/logger.ts

import config from '../config';

/**
 * Logging levels
 */
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Log record structure
 */
interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  context?: Record<string, any>;
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private service: string;
  private minLevel: LogLevel;

  /**
   * Creates a new logger instance
   * 
   * @param service - Service name for the logger
   */
  constructor(service: string) {
    this.service = service;
    this.minLevel = config.logging.level as LogLevel || LogLevel.INFO;
  }

  /**
   * Log a debug message
   * 
   * @param message - Log message
   * @param context - Optional context data
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   * 
   * @param message - Log message
   * @param context - Optional context data
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   * 
   * @param message - Log message
   * @param context - Optional context data
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   * 
   * @param message - Log message
   * @param context - Optional context data
   */
  error(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Internal logging function
   * 
   * @param level - Log level
   * @param message - Log message
   * @param context - Optional context data
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    // Skip logging if level is below minimum level
    if (!this.shouldLog(level)) {
      return;
    }

    const record: LogRecord = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.service,
      context
    };

    // Format log record based on configuration
    const formattedRecord = this.formatRecord(record);

    // Output log record
    this.outputRecord(level, formattedRecord);
  }

  /**
   * Check if the log level should be logged
   * 
   * @param level - Log level to check
   * @returns True if the level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minLevelIndex = levels.indexOf(this.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    
    return currentLevelIndex >= minLevelIndex;
  }

  /**
   * Format log record based on configuration
   * 
   * @param record - Log record to format
   * @returns Formatted log record
   */
  private formatRecord(record: LogRecord): string | Record<string, any> {
    if (config.logging.format === 'json') {
      return record;
    }

    const context = record.context ? ` ${JSON.stringify(record.context)}` : '';
    return `[${record.timestamp}] [${record.level.toUpperCase()}] [${record.service}] ${record.message}${context}`;
  }

  /**
   * Output log record to appropriate destination
   * 
   * @param level - Log level
   * @param record - Formatted log record
   */
  private outputRecord(level: LogLevel, record: string | Record<string, any>): void {
    // In production, we could send logs to CloudWatch, Papertrail, etc.
    // For now, just output to console
    const output = typeof record === 'string' ? record : JSON.stringify(record);
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
        console.error(output);
        break;
    }
  }
}