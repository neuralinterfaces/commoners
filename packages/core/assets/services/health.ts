import type { HooksInterface } from '../../types'

export type ServiceHealthStatus = 'unknown' | 'healthy' | 'unhealthy' | 'restarting' | 'stopped'

export type HealthMonitorConfig = {
  interval?: number // ms between health checks (default: 30000)
  timeout?: number // ms before a check is considered failed (default: 5000)
  retries?: number // consecutive failures before marking unhealthy (default: 3)
  autoRestart?: boolean // auto-restart unhealthy services (default: false)
}

const DEFAULT_CONFIG: Required<HealthMonitorConfig> = {
  interval: 30000,
  timeout: 5000,
  retries: 3,
  autoRestart: false,
}

export class ServiceHealthMonitor {
  private id: string
  private url: string
  private config: Required<HealthMonitorConfig>
  private hooks: HooksInterface
  private status: ServiceHealthStatus = 'unknown'
  private failureCount = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private onRestart?: () => void

  constructor(
    id: string,
    url: string,
    config: HealthMonitorConfig = {},
    hooks: HooksInterface,
    onRestart?: () => void,
  ) {
    this.id = id
    this.url = url
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.hooks = hooks
    this.onRestart = onRestart
  }

  getStatus(): ServiceHealthStatus {
    return this.status
  }

  start(): void {
    if (this.timer) return
    this.status = 'unknown'
    this.failureCount = 0

    // Perform initial check
    this.check()

    this.timer = setInterval(() => this.check(), this.config.interval)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.status = 'stopped'
  }

  private async check(): Promise<void> {
    const previousStatus = this.status

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

      const response = await fetch(this.url, {
        method: 'HEAD',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok || response.status < 500) {
        this.failureCount = 0

        if (this.status !== 'healthy') {
          this.status = 'healthy'
          this.hooks.emit({ type: 'service:ready', service: this.id, port: 0 })

          if (previousStatus === 'unhealthy' || previousStatus === 'restarting') {
            // Recovered
          }
        }
      } else {
        this.handleFailure()
      }
    } catch {
      this.handleFailure()
    }
  }

  private handleFailure(): void {
    this.failureCount++

    if (this.failureCount >= this.config.retries && this.status !== 'unhealthy') {
      this.status = 'unhealthy'
      this.hooks.emit({ type: 'service:error', service: this.id, error: new Error(`Service "${this.id}" is unhealthy after ${this.failureCount} failed health checks`) })

      if (this.config.autoRestart && this.onRestart) {
        this.status = 'restarting'
        this.hooks.emit({ type: 'service:restart', service: this.id })
        this.failureCount = 0
        this.onRestart()
      }
    }
  }
}
