import pino, { Logger } from "pino";

// Get log level from environment or default to 'info'
const logLevel = process.env.LOG_LEVEL || "info";

export const logger: Logger =
  process.env.NODE_ENV === "production"
    ? pino({
        level: logLevel,
        formatters: {
          level: (label) => ({ level: label.toUpperCase() }),
        },
      })
    : pino({
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
        level: logLevel,
      });

// Create child logger with module context
export const createLogger = (module: string) => logger.child({ module });
