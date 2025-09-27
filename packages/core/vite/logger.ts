import { createLogger, type Logger, type LogOptions, type LogErrorOptions, type LogType } from 'vite';

export function makeScopedLogger(scope = 'UB') : Logger {

  const vite = createLogger('info', { prefix: '' }); // Vite’s default logger
  
  const forward = (level: 'info'|'warn'|'error', msg: string) => {
    return // <-- Your sink: write to pino/winston/file/UI/etc.
  };

  return {
    info(msg: string, opts?: LogOptions) {
      forward('info', msg);
      vite.info(msg, opts);
    //   vite.info(`[${scope}] ${msg}`, opts);        // remove this line to suppress Vite’s own printing
    },
    warn(msg: string, opts?: LogOptions) {
      forward('warn', msg);
        vite.warn(msg, opts);
    //   vite.warn(`[${scope}] ${msg}`, opts);
    },
    warnOnce(msg: string, opts?: LogOptions) {
      // optional: de-dupe with your own logic
      forward('warn', msg);
      vite.warnOnce(msg, opts);
    //   vite.warnOnce(`[${scope}] ${msg}`, opts);
    },
    error(msg: string, opts?: LogErrorOptions) {
      forward('error', msg);
        vite.error(msg, opts);
    //   vite.error(`[${scope}] ${msg}`, opts);
    },
    clearScreen() {}, // No-op so it doesn't clear the console
    hasErrorLogged(e) {
      return vite.hasErrorLogged(e);
    },
    hasWarned: false,
  };
}