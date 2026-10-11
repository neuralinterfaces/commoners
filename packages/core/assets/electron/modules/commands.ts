/**
 * Typed Command Registry
 *
 * Replaces string-based IPC channels with typed command definitions.
 * Each command declares its channel, direction, and argument/return types.
 *
 * Usage:
 *   import { Commands, ScopedCommands } from './commands'
 *
 *   // Type-safe channel access:
 *   Commands.quit.channel        // 'commoners:quit'
 *   Commands.services.channel    // 'commoners:services'
 *   ScopedCommands.service('http', 'status').channel  // 'services:http:status'
 *   ScopedCommands.plugin('windows', 'open').channel  // 'plugins:windows:open'
 */

// ─── Direction types ────────────────────────────────────────────

type Direction = 'renderer-to-main' | 'main-to-renderer' | 'bidirectional'
type Pattern = 'sync' | 'async' | 'fire-and-forget'

// ─── Command definition ────────────────────────────────────────

interface CommandDef<
  TChannel extends string = string,
  TArgs extends any[] = any[],
  TReturn = void,
> {
  channel: TChannel
  direction: Direction
  pattern: Pattern
  description: string
  validate?: (args: any[]) => string | null
}

// ─── Framework commands (commoners:*) ───────────────────────────

function defineCommand<TChannel extends string, TArgs extends any[], TReturn = void>(
  channel: TChannel,
  direction: Direction,
  pattern: Pattern,
  description: string,
  validate?: (args: any[]) => string | null
): CommandDef<TChannel, TArgs, TReturn> {
  return { channel, direction, pattern, description, validate }
}

export const Commands = {
  quit: defineCommand<'commoners:quit', [message?: string]>(
    'commoners:quit',
    'renderer-to-main',
    'fire-and-forget',
    'Quit the application with optional message',
    args => (args.length > 1 ? 'quit: expected 0-1 args' : null)
  ),

  close: defineCommand<'commoners:close', [windowId: number]>(
    'commoners:close',
    'renderer-to-main',
    'fire-and-forget',
    'Close a window by ID',
    args =>
      args.length !== 1
        ? 'close: expected 1 arg'
        : typeof args[0] !== 'number'
          ? 'close: arg[0] expected number'
          : null
  ),

  services: defineCommand<'commoners:services', [], Record<string, any>>(
    'commoners:services',
    'renderer-to-main',
    'sync',
    'Request resolved services object',
    args => (args.length > 0 ? 'services: expected 0 args' : null)
  ),

  location: defineCommand<'commoners:location', [windowId: number], Record<string, any>>(
    'commoners:location',
    'renderer-to-main',
    'sync',
    'Get window location (search/hash) by ID',
    args =>
      args.length !== 1
        ? 'location: expected 1 arg'
        : typeof args[0] !== 'number'
          ? 'location: arg[0] expected number'
          : null
  ),

  pluginsLoaded: defineCommand<'commoners:plugins:loaded', [pageId: number, pluginId: string]>(
    'commoners:plugins:loaded',
    'renderer-to-main',
    'fire-and-forget',
    'Notify that a plugin has loaded in a page',
    args =>
      args.length !== 2
        ? 'plugins:loaded: expected 2 args'
        : typeof args[0] !== 'number'
          ? 'plugins:loaded: arg[0] expected number'
          : typeof args[1] !== 'string'
            ? 'plugins:loaded: arg[1] expected string'
            : null
  ),

  rendererReady: defineCommand<
    'commoners:window:ready:renderer:pong',
    [windowId: number]
  >(
    'commoners:window:ready:renderer:pong',
    'renderer-to-main',
    'fire-and-forget',
    'Renderer acknowledges ready ping'
  ),

  mainReadyPing: defineCommand<'commoners:window:ready:main:ping', [windowId: number]>(
    'commoners:window:ready:main:ping',
    'main-to-renderer',
    'fire-and-forget',
    'Main process pings renderer for ready state'
  ),

  mainReadyPong: defineCommand<'commoners:window:ready:main:pong', [windowId: number]>(
    'commoners:window:ready:main:pong',
    'renderer-to-main',
    'fire-and-forget',
    'Renderer acknowledges main ready ping'
  ),
} as const

// ─── Console redirect commands ──────────────────────────────────

export const ConsoleCommands = {
  log: defineCommand<'commoners:console.log', any[]>(
    'commoners:console.log',
    'main-to-renderer',
    'fire-and-forget',
    'Console.log redirection from main process'
  ),
  warn: defineCommand<'commoners:console.warn', any[]>(
    'commoners:console.warn',
    'main-to-renderer',
    'fire-and-forget',
    'Console.warn redirection from main process'
  ),
  error: defineCommand<'commoners:console.error', any[]>(
    'commoners:console.error',
    'main-to-renderer',
    'fire-and-forget',
    'Console.error redirection from main process'
  ),
} as const

// ─── Scoped command builders ────────────────────────────────────

/** Service-scoped channel attributes */
export type ServiceAttribute = 'status' | 'close' | 'log' | 'closed'

/** All known channel strings for framework commands */
export type FrameworkChannel = (typeof Commands)[keyof typeof Commands]['channel']

/** All known channel strings for console commands */
export type ConsoleChannel = (typeof ConsoleCommands)[keyof typeof ConsoleCommands]['channel']

/** Build a scoped channel string with type safety */
function scopedChannel(
  scope: 'services' | 'plugins',
  id: string,
  attr: string
): `${typeof scope}:${string}:${string}` {
  return `${scope}:${id}:${attr}`
}

export const ScopedCommands = {
  /** Build a service-scoped command channel */
  service(id: string, attr: ServiceAttribute) {
    return {
      channel: scopedChannel('services', id, attr),
      scope: 'services' as const,
      id,
      attr,
    }
  },

  /** Build a plugin-scoped command channel */
  plugin(id: string, channel: string) {
    return {
      channel: scopedChannel('plugins', id, channel),
      scope: 'plugins' as const,
      id,
      attr: channel,
    }
  },
} as const

// ─── Channel lookup helpers ─────────────────────────────────────

/** All registered framework command channels */
export const FRAMEWORK_CHANNELS = Object.values(Commands).map(c => c.channel)

/** Get a command definition by channel string */
export function getCommandByChannel(channel: string): CommandDef | undefined {
  return Object.values(Commands).find(c => c.channel === channel)
}

/** Check if a channel is a known framework command */
export function isFrameworkChannel(channel: string): boolean {
  return FRAMEWORK_CHANNELS.includes(channel as any)
}

/** Validate a message against the typed command registry */
export function validateCommand(channel: string, args: any[]): string | null {
  const cmd = getCommandByChannel(channel)
  if (cmd?.validate) return cmd.validate(args)
  return null
}
