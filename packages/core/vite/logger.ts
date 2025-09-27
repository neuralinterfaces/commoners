import { createLogger, type Logger, type LogOptions, type LogErrorOptions } from 'vite';

  const LOG_LEVELS = ['log', 'warn', 'error', 'info', 'debug'] as const;

  export class ScopedLogger implements Logger {
    #active = false
    #__levels = {}
    #logger = createLogger('info', { prefix: '' }); // Vite’s default logger


    constructor(customLoggingFunction: Function) {
        LOG_LEVELS.forEach(level => {
            this.#__levels[level] = console[level].bind(console);
            console[level] = (...args) => {
                const ogLevel = this.#__levels[level]
                if (this.#active) customLoggingFunction.call(this, ...args); // Forward to original console method
                else ogLevel(...args); // Forward to original console method
            }
        })
    }

    // Call original function safely
    call (callback) {  
        const currentState = this.#active;
        this.#active = false; // Set active state to true
        try { callback() } finally { this.#active = currentState; } // Restore original state
    } 

    #log(callback: any) {
        this.#active = true;
        try { callback() } finally { this.#active = false }
    }

    info(msg: string, opts?: LogOptions) {
      this.#log(() => this.#logger.info(msg, opts));
    }

    warn(msg: string, opts?: LogOptions) {
        this.#log(() => this.#logger.warn(msg, opts));
    }

    warnOnce(msg: string, opts?: LogOptions) {
        this.#log(() => this.#logger.warnOnce(msg, opts));
    }

    error(msg: string, opts?: LogErrorOptions) {
        this.#log(() => this.#logger.error(msg, opts));
    }

    clearScreen() {} // No-op so it doesn't clear the console

    hasErrorLogged(e) {
      return this.#logger.hasErrorLogged(e);
    }

    hasWarned = false;
  }
