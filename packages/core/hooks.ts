// Simple event emitter for hooks-based communication between core and CLI
import type { HookEvent, HookFunction, HooksInterface } from './types.js'

export class CoreHooks implements HooksInterface {
  private handlers = new Map<string, Set<HookFunction>>()

  emit(event: HookEvent): void {
    // Emit to specific event type handlers
    const typeHandlers = this.handlers.get(event.type)
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(event)
        } catch (error) {
          // Silently ignore handler errors to prevent breaking core functionality
        }
      })
    }

    // Emit to 'all' event handlers
    const allHandlers = this.handlers.get('all')
    if (allHandlers) {
      allHandlers.forEach(handler => {
        try {
          handler(event)
        } catch (error) {
          // Silently ignore handler errors to prevent breaking core functionality
        }
      })
    }
  }

  on(eventType: HookEvent['type'] | 'all', handler: HookFunction): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }

    const handlers = this.handlers.get(eventType)!
    handlers.add(handler)

    // Return unsubscribe function
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.handlers.delete(eventType)
      }
    }
  }
}

// Global hooks instance for core
export const coreHooks = new CoreHooks()

// Helper function to create a no-op hooks instance when none is provided
export const createNoOpHooks = (): HooksInterface => ({
  emit: () => {},
  on: () => () => {}
})