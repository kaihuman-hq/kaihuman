export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export class Logger {
  private module: string;
  // Production: only errors surface. Development: everything.
  private static level: LogLevel = import.meta.env.PROD ? LogLevel.ERROR : LogLevel.DEBUG;

  constructor(module: string) {
    this.module = module;
  }

  static setLevel(level: LogLevel) {
    Logger.level = level;
  }

  private formatMessage(message: string): string {
    return `[${this.module}] ${message}`;
  }

  debug(message: string, ...args: unknown[]) {
    if (Logger.level <= LogLevel.DEBUG) {
      console.log(this.formatMessage(message), ...args);
    }
  }

  info(message: string, ...args: unknown[]) {
    if (Logger.level <= LogLevel.INFO) {
      console.info(this.formatMessage(message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]) {
    if (Logger.level <= LogLevel.WARN) {
      console.warn(this.formatMessage(message), ...args);
    }
  }

  error(message: string, ...args: unknown[]) {
    if (Logger.level <= LogLevel.ERROR) {
      console.error(this.formatMessage(message), ...args);
    }
  }
}
