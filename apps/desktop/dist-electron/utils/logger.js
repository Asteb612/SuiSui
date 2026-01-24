"use strict";
/**
 * Logger utility for Electron main process
 * Provides structured logging with levels and context
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
exports.createLogger = createLogger;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    minLevel;
    context;
    constructor(context = 'App', minLevel = LogLevel.INFO) {
        this.context = context;
        this.minLevel = process.env.NODE_ENV === 'production' ? LogLevel.WARN : minLevel;
    }
    formatTimestamp() {
        return new Date().toISOString();
    }
    formatLevel(level) {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        return levels[level]?.padEnd(5) || 'UNKNOWN';
    }
    shouldLog(level) {
        return level >= this.minLevel;
    }
    log(level, message, data, error) {
        if (!this.shouldLog(level))
            return;
        const entry = {
            timestamp: this.formatTimestamp(),
            level,
            context: this.context,
            message,
            data,
            error,
        };
        const prefix = `[${entry.timestamp}] [${this.formatLevel(level)}] [${this.context}]`;
        const logMessage = `${prefix} ${message}`;
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(logMessage, data ? JSON.stringify(data, null, 2) : '', error || '');
                break;
            case LogLevel.INFO:
                console.info(logMessage, data ? JSON.stringify(data, null, 2) : '');
                break;
            case LogLevel.WARN:
                console.warn(logMessage, data ? JSON.stringify(data, null, 2) : '', error || '');
                break;
            case LogLevel.ERROR:
                console.error(logMessage, data ? JSON.stringify(data, null, 2) : '', error || '');
                if (error) {
                    console.error('Stack trace:', error.stack);
                }
                break;
        }
    }
    debug(message, data) {
        this.log(LogLevel.DEBUG, message, data);
    }
    info(message, data) {
        this.log(LogLevel.INFO, message, data);
    }
    warn(message, data, error) {
        this.log(LogLevel.WARN, message, data, error);
    }
    error(message, error, data) {
        this.log(LogLevel.ERROR, message, data, error);
    }
    child(context) {
        return new Logger(`${this.context}:${context}`, this.minLevel);
    }
}
// Create default logger instance
exports.logger = new Logger('App', LogLevel.INFO);
// Export factory function for creating context-specific loggers
function createLogger(context, minLevel = LogLevel.INFO) {
    return new Logger(context, minLevel);
}
//# sourceMappingURL=logger.js.map