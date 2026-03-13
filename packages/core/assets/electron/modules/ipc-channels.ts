/**
 * IPC Channel Registry and Validation
 *
 * Pure-data module with zero Electron imports. Defines expected argument shapes
 * for known IPC channels and provides lightweight runtime validation.
 *
 * Validation is non-blocking: callers log failures but do not reject messages.
 */

export type ArgType = 'string' | 'number' | 'boolean' | 'object'

export interface ArgValidator {
  minArgs: number
  maxArgs: number
  argTypes?: ArgType[]
  description?: string
}

/**
 * Registry of exact `commoners:*` channels and their expected argument shapes.
 */
export const CHANNEL_REGISTRY: Record<string, ArgValidator> = {
  'commoners:quit': {
    minArgs: 0,
    maxArgs: 1,
    argTypes: ['string'],
    description: 'Quit the application with optional message',
  },
  'commoners:close': {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ['number'],
    description: 'Close a window by ID',
  },
  'commoners:services': {
    minArgs: 0,
    maxArgs: 0,
    description: 'Request resolved services object',
  },
  'commoners:location': {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ['number'],
    description: 'Get window location by ID',
  },
  'commoners:plugins:loaded': {
    minArgs: 2,
    maxArgs: 2,
    argTypes: ['number', 'string'],
    description: 'Notify that a plugin has loaded in a page',
  },
  'commoners:window:ready:renderer:pong': {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ['number'],
    description: 'Renderer acknowledges ready ping',
  },
  'commoners:window:ready:main:pong': {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ['number'],
    description: 'Main process acknowledges ready ping',
  },
}

/**
 * Validators for scoped channel attributes (e.g. services:id:attr, plugins:id:attr).
 * The attribute is the last segment after the scope and ID.
 */
export const SCOPED_CHANNEL_VALIDATORS: Record<string, ArgValidator> = {
  status: {
    minArgs: 0,
    maxArgs: 0,
    description: 'Query service/plugin status',
  },
  close: {
    minArgs: 0,
    maxArgs: 0,
    description: 'Close a service/plugin',
  },
  log: {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ['string'],
    description: 'Log message from service/plugin',
  },
  closed: {
    minArgs: 1,
    maxArgs: 1,
    argTypes: ['number'],
    description: 'Service/plugin closed with exit code',
  },
}

/**
 * Validate an IPC message against the channel registry.
 *
 * @returns null if valid (or unknown channel — pass-through), string describing the failure otherwise.
 */
export function validateIPCMessage(channel: string, args: any[]): string | null {
  // Check exact match in CHANNEL_REGISTRY
  const exactValidator = CHANNEL_REGISTRY[channel]
  if (exactValidator) {
    return validateArgs(channel, args, exactValidator)
  }

  // Check scoped channels: services:<id>:<attr> or plugins:<id>:<attr>
  const scopedMatch = channel.match(/^(?:services|plugins):([^:]+):(.+)$/)
  if (scopedMatch) {
    const attr = scopedMatch[2]
    const scopedValidator = SCOPED_CHANNEL_VALIDATORS[attr]
    if (scopedValidator) {
      return validateArgs(channel, args, scopedValidator)
    }
  }

  // Unknown channel — pass-through (no validation)
  return null
}

function validateArgs(channel: string, args: any[], validator: ArgValidator): string | null {
  if (args.length < validator.minArgs) {
    return `${channel}: expected at least ${validator.minArgs} arg(s), got ${args.length}`
  }

  if (args.length > validator.maxArgs) {
    return `${channel}: expected at most ${validator.maxArgs} arg(s), got ${args.length}`
  }

  if (validator.argTypes) {
    for (let i = 0; i < Math.min(args.length, validator.argTypes.length); i++) {
      const expected = validator.argTypes[i]
      const actual = typeof args[i]
      if (actual !== expected) {
        return `${channel}: arg[${i}] expected ${expected}, got ${actual}`
      }
    }
  }

  return null
}
