export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export class Logger {
  private module: string;
  private static level: LogLevel = import.meta.env.PROD ? LogLevel.NONE : LogLevel.DEBUG;

  constructor(module: string) {
    this.module = module;
  }

  static setLevel(level: LogLevel) {
    Logger.level = level;
  }

  private formatMessage(message: string): string {
    return `[${this.module}] ${message}`;
  }

  debug(message: string, ...args: any[]) {
    if (Logger.level <= LogLevel.DEBUG) {
      if (import.meta.env.PROD) return; // Explicitly silence debug in prod if not already handled by level
      console.log(this.formatMessage(message), ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (Logger.level <= LogLevel.INFO) {
      console.info(this.formatMessage(message), ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (Logger.level <= LogLevel.WARN) {
      // User requested: "in production no warnings and errors are logged"
      // So if PROD, we might want to suppress this unless level is explicitly set lower?
      // The requirement says "Make sure that in production no warnings and errors are logged to the console."
      // If we rely on the static default level (NONE in PROD), this is handled.
      // But let's be safe.
      if (import.meta.env.PROD && Logger.level > LogLevel.INFO) return;
      console.warn(this.formatMessage(message), ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (Logger.level <= LogLevel.ERROR) {
      // Same logic as warn
      if (import.meta.env.PROD && Logger.level > LogLevel.INFO) return;
      console.error(this.formatMessage(message), ...args);
    }
  }
}
