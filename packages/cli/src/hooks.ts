// Hook handlers for CLI - handles all text output from core events
import type { HookEvent, HooksInterface } from '@commoners/solidarity/types'
import { ui } from './ui/index.js'

import _chalk from 'chalk'
const chalk = _chalk.default || _chalk // Handle both ESM and CJS imports

export class CLIHooks implements HooksInterface {
  private handlers = new Map<string, Set<(event: HookEvent) => void>>()

  constructor() {
    // Set up default CLI handlers for all core events
    this.setupDefaultHandlers()
  }

  emit(event: HookEvent): void {
    // Emit to specific event type handlers
    const typeHandlers = this.handlers.get(event.type)
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(event)
        } catch (error) {
          // Log handler errors but don't break execution
          console.error('Hook handler error:', error)
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
          console.error('Hook handler error:', error)
        }
      })
    }
  }

  on(eventType: HookEvent['type'] | 'all', handler: (event: HookEvent) => void): () => void {
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

  private setupDefaultHandlers(): void {
    // Build events
    this.on('build:start', (event) => {
      if (event.type === 'build:start') {
          if (event.dev) return 
          const { name, target } = event.config
          const buildTitle = `${name} ${ui.target(target, { plain: true })} Build`
          ui.header(buildTitle)
      }
    })

    this.on('build:assets:start', (event) => {
      if (event.type === 'build:assets:start') {
        switch (event.phase) {
          case 'frontend':
            ui.pushSection('Frontend Assets')
            break
          case 'services':
            ui.pushSection('Services')
            break
          case 'packaging':
            ui.pushSection('App Packaging')
            break
        }
      }
    })

    this.on('build:assets:complete', (event) => {
      if (event.type === 'build:assets:complete') {
        switch (event.phase) {
          case 'frontend':
            ui.popSection()
            break
          case 'services':
            ui.popSection()
            break
          case 'packaging':
            ui.popSection()
            break
        }
      }
    })

    this.on('build:electron:start', () => {
      ui.pushSection('Electron Builder')
    })

    this.on('build:electron:complete', () => {
      ui.popSection()
    })

    this.on('build:mobile:start', (event) => {
      if (event.type === 'build:mobile:start') {
        ui.info(`Initializing ${event.mobileTarget} build...`)
      }
    })

    this.on('build:complete', (event) => {
      if (event.type === 'build:complete') {
        const { config, outDir } = event
        const { name, target } = config
        const targetName = this.getTargetDisplayName(target)

        ui.box(
          `${name} (${targetName}) was built successfully!\n${chalk.gray(outDir)}`,
          {
            title: chalk.bold(`✨ Build Successful`),
            borderColor: 'success',
            align: 'center',
          }
        )
      }
    })

    this.on('build:error', (event) => {
      if (event.type === 'build:error') {
        ui.error(
          `Build failed${event.phase ? ` during ${event.phase}` : ''}`,
          event.error.message
        )
      }
    })

    this.on('launch:start', (event) => {
      if (event.type === 'launch:start') {
        ui.header(`Launching ${ui.target(event.target, { plain: true })} Application`)
        ui.info(`Output Directory: ${event.outDir}`)
      }
    })

    this.on('launch:ready', (event) => {
      if (event.type === 'launch:ready') {
        ui.success('Application launched successfully!')
      }
    })

    this.on('launch:error', (event) => {
      if (event.type === 'launch:error') {
        ui.error('Launch failed', event.error.message)
      }
    })

    // Service events
    this.on('service:start', (event) => {
      if (event.type === 'service:start') {
        ui.service(event.service, `Starting service at ${event.url}`, 'info')
      }
    })

    this.on('service:ready', (event) => {
      if (event.type === 'service:ready') {
        ui.service(event.service, `Ready on port ${event.port}`, 'success')
      }
    })

    this.on('service:stdout', (event) => {
      if (event.type === 'service:stdout') ui.service(event.service, event.data, 'info')
    })

    this.on('service:stderr', (event) => {
      if (event.type === 'service:stderr') ui.service(event.service, event.data, 'info')
    })

    this.on('service:error', (event) => {
      if (event.type === 'service:error') {
        ui.service(event.service, `Error: ${event.error.message}`, 'error')
      }
    })


    this.on('service:exit', (event) => {
      if (event.type === 'service:exit') {
        if (event.code === null) ui.service(event.service, 'Restarting...', 'info')
        else {
          const type = event.code === 0 ? 'success' : 'error'
          ui.service(event.service, `Exited with code ${event.code}`,type)
        }
      }
    })

    this.on('service:restart', (event) => {
      if (event.type === 'service:restart') {
        ui.service(event.service, 'Restarting...', 'info')
      }
    })

    this.on('service:build:start', (event) => {
      if (event.type === 'service:build:start') return
    })
    
    this.on('service:build:end', (event) => {
      if (event.type === 'service:build:end') {
        ui.service(event.service, `Build completed`, 'success')
        if (event.out) ui.details(`${event.out}`)
        console.log()
      }
    })

    this.on('service:build:error', (event) => {
      if (event.type === 'service:build:error') {
        ui.service(event.service, `Build failed`, 'error')
        if (event.error) ui.details(event.error.message)
        console.log()
      }
    })

    this.on('service:build:cached', (event) => {
      if (event.type === 'service:build:cached') {
        ui.service(event.service, `Using cached build`, 'info')
        if (event.out) ui.details(`${event.out}`)
        console.log()
      }
    })

    this.on('service:launch:start', (event) => {
      if (event.type === 'service:launch:start') return
    })

    this.on('service:launch:complete', (event) => {
      if (event.type === 'service:launch:complete') return
    })

    this.on('service:launch:error', (event) => {
      if (event.type === 'service:launch:error') {
        ui.service(event.service, `Failed to launch service`, 'error')
      }
    })

    // Security events
    this.on('security:warning', (event) => {
      if (event.type === 'security:warning') {
        ui.warning(
          event.message,
          event.context ? `Context: ${event.context}` : undefined
        )
      }
    })

    this.on('security:integrity:start', (event) => {
      if (event.type === 'security:integrity:start') {
        ui.info(`Embedding integrity data for ${event.asarPath}`)
      }
    })

    this.on('security:integrity:complete', (event) => {
      if (event.type === 'security:integrity:complete') {
        if (event.success) {
          ui.success(`Integrity data embedded successfully`)
        } else {
          ui.error(`Failed to embed integrity data for ${event.asarPath}`)
        }
      }
    })

    // Dev server events
    this.on('dev:server:start', (event) => {
      if (event.type === 'dev:server:start') {
          const { name, target: resolvedTarget } = event.config
          ui.header(`${name} ${ui.target(resolvedTarget, { plain: true })} Development`)
          ui.info(`Starting development server`)
      }
    })

    this.on('dev:server:ready', (event) => {
      if (event.type === 'dev:server:ready') {
        ui.success(
          `Development server ready!`,
          `Available at: ${event.url}`
        )
      }
    })

    this.on('dev:server:error', (event) => {
      if (event.type === 'dev:server:error') {
        ui.error('Development server error', event.error.message)
      }
    })

    this.on('dev:reload:unavailable', (event) => {
      if (event.type === 'dev:reload:unavailable') {
        const targetName = this.getTargetDisplayName(event.target)
        ui.warning(
          `${targetName} hot reloading is not available`,
          event.reason
        )
      }
    })
  }

  private getTargetDisplayName(target: string): string {
    switch (target) {
      case 'web': return 'Web'
      case 'pwa': return 'PWA'
      case 'electron': return 'Desktop'
      case 'mobile': return 'Mobile'
      case 'ios': return 'iOS'
      case 'android': return 'Android'
      case 'tauri': return 'Tauri'
      default: return target
    }
  }
}

// Global CLI hooks instance
export const cliHooks = new CLIHooks()