/**
 * Lifecycle Probe Plugin
 *
 * Regression test plugin that registers IPC handlers in start() and ready()
 * hooks. If config stripping removes these hooks, the handlers won't exist
 * and the corresponding e2e tests will fail.
 */

export function load() {
  return {
    startPing: () => this.invoke('start-ping'),
    readyPing: () => this.invoke('ready-ping'),
  }
}

export function start() {
  this.handle('start-ping', () => 'start-pong')
}

export function ready() {
  this.handle('ready-ping', () => 'ready-pong')
}
