// Hook handlers for CLI - handles all text output from core events
import type { HookEvent, HookFunction, HooksInterface } from '../../types.js'

import { createRequire } from 'module'
import { CommonersUI } from './ui.js'

const prettyPrintDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(2)} ms`
  const seconds = (ms / 1000).toFixed(2)
  return `${seconds} seconds`
}

export class Hooks implements HooksInterface {
  private handlers = new Map<string, Set<HookFunction>>()

  emit(event: HookEvent): void {
    // Emit to specific event type handlers
    const typeHandlers = this.handlers.get(event.type)
    if (typeHandlers) {
      typeHandlers.forEach(handler => {
        try {
          handler(event)
        } catch {
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
        } catch {
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

export class DefaultHooks extends Hooks {
  private ui: CommonersUI

  constructor(ui: CommonersUI = new CommonersUI()) {
    super()
    this.ui = ui
    this.setupDefaultHandlers() // Set up default CLI handlers for all core events
  }

  private setupDefaultHandlers(): void {
    // Generic events
    this.on('log', event => {
      if (event.type === 'log') this.ui.add(...event.args)
    })

    // Build events
    this.on('build:start', event => {
      if (event.type === 'build:start') {
        if (event.dev) return
        const { name, target } = event.config
        const buildTitle = `${name} ${this.ui.target(target, { plain: true })} Build`
        this.ui.header(buildTitle)
      }
    })

    this.on('build:assets:start', event => {
      if (event.type === 'build:assets:start') {
        switch (event.phase) {
          case 'frontend':
            this.ui.pushBoxedSection('Frontend Assets')
            break
          case 'services':
            this.ui.pushBoxedSection('Services')
            break
          case 'packaging':
            this.ui.pushBoxedSection('App Packaging')
            break
        }
      }
    })

    this.on('build:assets:complete', event => {
      if (event.type === 'build:assets:complete') {
        switch (event.phase) {
          case 'frontend':
            this.ui.popSection()
            break
          case 'services':
            this.ui.popSection()
            break
          case 'packaging':
            this.ui.popSection()
            break
        }
      }
    })

    this.on('build:electron:start', () => {
      this.ui.pushSection('Electron Builder')
    })

    this.on('build:electron:complete', () => {
      this.ui.popSection()
    })

    this.on('build:mobile:start', event => {
      if (event.type === 'build:mobile:start') {
        this.ui.info(`Initializing ${event.mobileTarget} build...`)
      }
    })

    this.on('build:complete', event => {
      if (event.type === 'build:complete') {
        if (event.dev) return // Skip success box in dev mode
        const { config, outDir } = event
        const { name, target } = config
        const targetName = this.getTargetDisplayName(target)

        const require = createRequire(import.meta.url)
        const chalk = require('chalk').default

        this.ui.box(
          `${name} (${targetName}) was built successfully!\n${chalk.gray(this.ui.path(outDir))}`,
          {
            title: chalk.bold(`✨ Build Successful`),
            borderColor: 'success',
            align: 'left',
          }
        )
      }
    })

    this.on('build:error', event => {
      if (event.type === 'build:error') {
        this.ui.error(
          `Build failed${event.phase ? ` during ${event.phase}` : ''}`,
          event.error.message
        )
      }
    })

    this.on('launch:start', event => {
      if (event.type === 'launch:start') {
        this.ui.header(`Launching ${this.ui.target(event.target, { plain: true })} Application`)
        this.ui.info(`Output Directory: ${event.outDir}`)
      }
    })

    this.on('launch:ready', event => {
      if (event.type === 'launch:ready') {
        this.ui.success('Application launched successfully!')
      }
    })

    this.on('launch:error', event => {
      if (event.type === 'launch:error') {
        this.ui.error('Launch failed', event.error.message)
      }
    })

    // Service events
    this.on('service:start', event => {
      if (event.type === 'service:start') {
        this.ui.service(event.service, `Starting service at ${event.url}`, 'info')
      }
    })

    this.on('service:ready', event => {
      if (event.type === 'service:ready') {
        this.ui.service(event.service, `Ready on port ${event.port}`, 'success')
      }
    })

    this.on('service:stdout', event => {
      if (event.type === 'service:stdout') this.ui.service(event.service, event.data, 'info')
    })

    this.on('service:stderr', event => {
      if (event.type === 'service:stderr') this.ui.service(event.service, event.data, 'info')
    })

    this.on('service:error', event => {
      if (event.type === 'service:error') {
        this.ui.service(event.service, `Error: ${event.error.message}`, 'error')
      }
    })

    this.on('service:exit', event => {
      if (event.type === 'service:exit') {
        if (event.code === null) return
        const type = event.code === 0 ? 'success' : 'error'
        this.ui.service(event.service, `Exited with code ${event.code}`, type)
      }
    })

    this.on('service:restart', event => {
      if (event.type === 'service:restart') {
        this.ui.service(event.service, 'Restarting...', 'info')
      }
    })

    this.on('service:build:start', event => {
      if (event.type === 'service:build:start') return
    })

    this.on('service:build:end', event => {
      if (event.type === 'service:build:end') {
        this.ui.service(
          event.service,
          `Build completed${event.duration ? ` in ${prettyPrintDuration(event.duration)}` : ''}`,
          'success'
        )
        if (event.out) this.ui.details(this.ui.path(event.out))
        this.ui.add()
      }
    })

    this.on('service:build:error', event => {
      if (event.type === 'service:build:error') {
        this.ui.service(event.service, `Build failed`, 'error')
        if (event.error) {
          this.ui.details(event.error.message)
        }
        this.ui.add()
      }
    })

    this.on('service:build:cached', event => {
      if (event.type === 'service:build:cached') {
        this.ui.service(event.service, `Using cached build artifact`, 'info')
        this.ui.add()
      }
    })

    this.on('service:launch:start', event => {
      if (event.type === 'service:launch:start') return
    })

    this.on('service:launch:complete', async event => {
      if (event.type === 'service:launch:complete') return
    })

    this.on('service:launch:error', event => {
      if (event.type === 'service:launch:error') {
        this.ui.service(event.service, `Failed to launch service`, 'error')
      }
    })

    // Security events
    this.on('security:warning', event => {
      if (event.type === 'security:warning') {
        this.ui.warning(event.message, event.context ? `Context: ${event.context}` : undefined)
      }
    })

    this.on('security:integrity:start', event => {
      if (event.type === 'security:integrity:start') {
        this.ui.info(`Embedding integrity data for ${event.asarPath}`)
      }
    })

    this.on('security:integrity:complete', event => {
      if (event.type === 'security:integrity:complete') {
        if (event.success) {
          this.ui.success(`Integrity data embedded successfully`)
        } else {
          this.ui.error(`Failed to embed integrity data for ${event.asarPath}`)
        }
      }
    })

    // Dev server events
    this.on('dev:start', event => {
      if (event.type === 'dev:start') {
        const { name, target: resolvedTarget } = event.config
        this.ui.header(`${name} ${this.ui.target(resolvedTarget, { plain: true })} Development`)
      }
    })

    this.on('dev:server:ready', event => {
      if (event.type === 'dev:server:ready') {
        this.ui.success(`Development server ready!`, `Available at: ${event.url}`)
      }
    })

    this.on('dev:server:error', event => {
      if (event.type === 'dev:server:error') {
        this.ui.error('Development server error', event.error.message)
      }
    })

    this.on('dev:reload:unavailable', event => {
      if (event.type === 'dev:reload:unavailable') {
        const targetName = this.getTargetDisplayName(event.target)
        this.ui.warning(`${targetName} hot reloading is not available`, event.reason)
      }
    })

    const ELECTRON_PROCESS_NAME = 'commoners-electron-process'

    const labelRegexp = /\[.*\] /
    const ESC = String.fromCharCode(0x1b)
    const ansiRegex = new RegExp(
      ESC + '[[\\]()#;?]*([0-9]{1,4}(;[0-9]{0,4})*)?[\\dA-PR-TZcf-ntqry=><]',
      'g'
    )

    const logForElectron = (ev: any, type: 'info' | 'error' | 'success' = 'info') => {
      const { data } = ev
      const message = data.toString()
      if (!message.trim()) return // Skip empty lines
      if (labelRegexp.test(message.replace(ansiRegex, ''))) return console.log(message)
      else this.ui.service(ELECTRON_PROCESS_NAME, data, type)
    }

    this.on('dev:electron:ready', event => {
      if (event.type === 'dev:electron:ready')
        this.ui.success(`Electron app is ready!`, `Process ID: ${event.app.pid}`)
    })

    this.on('dev:electron:stdout', event => {
      if (event.type === 'dev:electron:stdout') logForElectron(event, 'info')
    })

    this.on('dev:electron:stderr', event => {
      if (event.type === 'dev:electron:stderr') logForElectron(event, 'error')
    })
  }

  private getTargetDisplayName(target: string): string {
    switch (target) {
      case 'web':
        return 'Web'
      case 'pwa':
        return 'PWA'
      case 'electron':
        return 'Desktop'
      case 'mobile':
        return 'Mobile'
      case 'ios':
      case 'ios-capacitor':
        return 'iOS'
      case 'android':
      case 'android-capacitor':
        return 'Android'
      case 'tauri':
        return 'Tauri'
      case 'ios-tauri':
        return 'iOS (Tauri)'
      case 'android-tauri':
        return 'Android (Tauri)'
      default:
        return target
    }
  }
}
