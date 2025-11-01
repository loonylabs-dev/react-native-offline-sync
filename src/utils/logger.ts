/**
 * Simple logger utility with debug mode support
 */
export class Logger {
  private debug: boolean;
  private prefix: string;

  constructor(prefix: string = '[OfflineSync]', debug: boolean = false) {
    this.prefix = prefix;
    this.debug = debug;
  }

  setDebug(enabled: boolean) {
    this.debug = enabled;
  }

  log(...args: any[]) {
    if (this.debug) {
      console.log(this.prefix, ...args);
    }
  }

  info(...args: any[]) {
    if (this.debug) {
      console.info(this.prefix, ...args);
    }
  }

  warn(...args: any[]) {
    console.warn(this.prefix, ...args);
  }

  error(...args: any[]) {
    console.error(this.prefix, ...args);
  }
}

export const createLogger = (prefix?: string, debug?: boolean): Logger => {
  return new Logger(prefix, debug);
};
