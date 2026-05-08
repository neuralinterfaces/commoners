import electron, {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  CustomScheme,
  IpcMainEvent,
  IpcRenderer,
} from 'electron'
import * as utils from '@electron-toolkit/utils'
import { ChildProcess } from 'node:child_process'

type ViteUserConfig = import('vite').UserConfig
type ElectronBuilderConfiguration = import('electron-builder').Configuration
type PublishOptions = import('electron-builder').PublishOptions

type ManifestOptions = import('vite-plugin-pwa').ManifestOptions

export function tuple<T extends string[]>(...o: T) {
  return o
}

export type PortType = number
export type LocalHostType = 'localhost' | '0.0.0.0'

type LogEvent = { type: 'log'; args: any[] }
export type GenericEvent = LogEvent

// Event types for hooks-based logging system
export type BuildEvent =
  | { type: 'build:start'; config: ResolvedConfig; dev: boolean }
  | { type: 'build:assets:start'; phase: 'services'; services?: string[] }
  | { type: 'build:assets:start'; phase: 'frontend' | 'packaging' }
  | {
      type: 'build:assets:complete'
      phase: 'frontend' | 'services' | 'packaging'
      duration?: number
    }
  | { type: 'build:electron:start' }
  | { type: 'build:electron:complete'; duration?: number }
  | { type: 'build:mobile:start'; mobileTarget: 'ios' | 'android' }
  | { type: 'build:complete'; config: ResolvedConfig; outDir: string; duration?: number }
  | { type: 'build:error'; error: Error; phase?: string }

export type ServiceEvent =
  | { type: 'service:start'; service: string; url: string }
  | { type: 'service:ready'; service: string; port: number }
  | { type: 'service:stdout'; data: string; service: string }
  | { type: 'service:stderr'; data: string; service: string }
  | { type: 'service:error'; error: Error; service: string }
  | { type: 'service:exit'; service: string; code: number | null }
  | { type: 'service:restart'; service: string }
  | { type: 'service:build:start'; service: string; src: string; out: string }
  | { type: 'service:build:end'; service: string; src: string; out: string; duration?: number }
  | { type: 'service:build:error'; service: string; src: string; out: string; error: Error }
  | { type: 'service:build:cached'; service: string; src: string; out: string }
  | { type: 'service:launch:start'; service: string; filepath: string }
  | { type: 'service:launch:complete'; service: string; filepath: string; url: string }
  | { type: 'service:launch:error'; service: string; filepath: string; error: Error }

export type SecurityEvent =
  | { type: 'security:warning'; message: string; context?: string }
  | { type: 'security:integrity:start'; asarPath: string }
  | { type: 'security:integrity:complete'; asarPath: string; success: boolean }
  | { type: 'security:protocol:blocked'; origin: string; url: string }
  | { type: 'security:service:integrity:pass'; service: string; signer?: string; hash?: string }
  | {
      type: 'security:service:integrity:fail'
      service: string
      expected: string
      actual: string
      reason?: string
    }
  | { type: 'security:service:integrity:skipped'; service: string; reason: string }
  | { type: 'security:asar:strict:error'; message: string }
  | { type: 'security:ipc:validation-fail'; channel: string; message: string }
  | { type: 'security:info'; message: string; context?: string }

export type DevServerEvent =
  | { type: 'dev:start'; config: ResolvedConfig }
  | { type: 'dev:server:ready'; target: string; url: string }
  | { type: 'dev:server:error'; error: Error }
  | { type: 'dev:reload:unavailable'; target: string; reason: string }
  | { type: 'dev:electron:stdout'; data: string }
  | { type: 'dev:electron:stderr'; data: string }
  | { type: 'dev:electron:ready'; app: ChildProcess }

export type LaunchEvent =
  | { type: 'launch:start'; outDir: string; target: string }
  | { type: 'launch:ready'; url?: string; server?: any }
  | { type: 'launch:error'; error: Error; target?: string }

export type HookEvent =
  | GenericEvent
  | BuildEvent
  | LaunchEvent
  | ServiceEvent
  | SecurityEvent
  | DevServerEvent

// Hook function type
export type HookFunction = (event: HookEvent) => void | Promise<void>

// Hooks interface for core-CLI communication
export interface HooksInterface {
  emit: (event: HookEvent) => void
  on: (eventType: HookEvent['type'] | 'all', handler: HookFunction) => () => void
}

export type LaunchOutput = {
  url?: string // URL for web targets
}

export type ServiceOptions = string | string[]

export type ServiceCreationOptions = {
  root?: string
  target?: string
  services?: string | string[] | boolean
  build?: boolean
  onLog?: (...args: unknown[]) => void
  onClosed?: (...args: unknown[]) => void
  hooks?: HooksInterface // Hooks interface for CLI integration
}

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> }

export type WritableElectronBuilderConfig = DeepWriteable<ElectronBuilderConfiguration>

// ------------------- Support -------------------
export const validMobileTargets = [
  'mobile',
  'ios',
  'android',
  'ios-capacitor',
  'android-capacitor',
  'ios-tauri',
  'android-tauri',
]

export const validDesktopTargets = ['desktop', 'electron', 'tauri']

export const universalTargetTypes = ['desktop', 'mobile', 'pwa', 'web']

const allTargets = Array.from(
  new Set([...universalTargetTypes, ...validDesktopTargets, ...validMobileTargets])
)

export const valid = {
  // Derived
  target: tuple(...allTargets.sort((a, b) => a.localeCompare(b))), // NOTE: Really these should transform to the relevant universal type

  // Internal
  command: tuple('start', 'dev', 'build', 'launch'),

  // Configuration
  icon: tuple('light', 'dark'),
}

export type ViteOptions = { dev?: boolean; hooks?: HooksInterface }
export type ServerOptions = { printUrls?: boolean }

export type TargetType = (typeof valid.target)[number]
export type SpecificTargetType =
  | 'electron'
  | 'tauri'
  | 'ios-capacitor'
  | 'android-capacitor'
  | 'ios-tauri'
  | 'android-tauri'
  | 'web'

// export type PlatformType = typeof validDesktopTargets[number]

// ------------------- Capabilities -------------------
export type ExtensionRuntime = 'process' | 'wasm' | 'browser' | 'remote'

export type PlatformSupport = {
  web?: boolean
  desktop?: boolean | 'electron' | 'tauri'
  mobile?: boolean | 'ios' | 'android'
}

export type ExtensionCapabilities = {
  provides?: string[] // What this extension offers (e.g. ['bluetooth', 'scanning'])
  platforms?: PlatformSupport // Where it can run
  runtime?: ExtensionRuntime // How it's delivered
  requires?: string[] // Dependencies on other extension IDs
}

// ------------------- Services -------------------
type BaseServiceMetadata = { src: string } | { url: string }

export type PackageBuildInfo = {
  name: string
  force?: boolean
  src: string // Absolute Source File
  out: string // Absolute Output File
}

type UserBuildCommand = string | ((info: PackageBuildInfo) => string | Promise<string>) // e.g. could respond to platform or manually build the executable

type SSLConfiguration = {
  key: string
  cert: string
  __keySource?: string // Original source path for build-time asset collection
  __certSource?: string // Original source path for build-time asset collection
}

export type ResolvedServices = { [x: string]: ResolvedService }

type _ExtraServiceMetadata = {
  public?: boolean
  port?: number
  build?: UserBuildCommand
  env?:
    | Record<string, string>
    | ((services: ResolvedServices) => Record<string, string> | Promise<Record<string, string>>)
  ssl?: SSLConfiguration
}

type _ServiceMetadata = string | false | (BaseServiceMetadata & _ExtraServiceMetadata)

type PublishSelectiveOptions = {
  local?: Partial<_ServiceMetadata>
  remote?: Partial<_ServiceMetadata>
}

type ExtraServiceMetadata = _ExtraServiceMetadata & {
  publish?: Partial<_ServiceMetadata> & { base?: string } & PublishSelectiveOptions
}

export type UserService = string | (BaseServiceMetadata & ExtraServiceMetadata) // Can nest build by platform type

type ServiceStatus = null | boolean

export type ResolvedService = {
  // For Service Build
  filepath: string
  base: string | null
  build: ExtraServiceMetadata['build']
  env?: ExtraServiceMetadata['env']
  ssl?: SSLConfiguration
  __src: string
  __compile: boolean
  __autobuild: boolean

  public: boolean

  // For Client
  url: string // What URL to use for service requests
  status: ServiceStatus

  capabilities?: ExtensionCapabilities
}

export type ActiveService = ResolvedService & { process: ChildProcess }
export type ActiveServices = { [x: string]: ActiveService }

// ------------------- Lazy Factories -------------------
/**
 * Property that can be provided eagerly or as a lazy factory for tree-shaking.
 * Lazy factories must be created with the `lazy()` helper from `@commoners/solidarity`.
 * Example: `desktop: lazy(() => import('./desktop-hooks'))`
 */
export type Lazy<T> = T | (() => Promise<T>)

// ------------------- Plugins -------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BaseLoadedPlugin = { [x: string]: any } | ((...args: any[]) => any) | any
type LoadedPlugin = BaseLoadedPlugin | Promise<BaseLoadedPlugin>

type SupportQueryInfo = {
  DEV: boolean
  PROD: boolean
  MOBILE: false | 'ios' | 'android'
  DESKTOP: false | 'electron' | 'tauri'
  WEB: boolean
}

type SupportQueryResultBase = boolean | string
type SupportQueryResult = SupportQueryResultBase | Promise<SupportQueryResultBase>
type SupportQuery = (info: SupportQueryInfo) => SupportQueryResult

type TagName = string
type TagAttribute = Record<string, string>

export type CapacitorConfig = {
  name: string
  plugin: string
  options?: any
  plist?: Record<string, any>
  manifest?: Record<TagName, TagAttribute[]>
}

type DesktopPluginContext = {
  id: string
  runtime: import('./assets/runtime/types').DesktopRuntime
  electron: typeof electron // Legacy — prefer runtime abstraction for Tauri compatibility
  utils: typeof utils // Legacy — prefer runtime abstraction for Tauri compatibility
  createWindow: (page: string, opts: BrowserWindowConstructorOptions) => BrowserWindow
  send: (channel: string, ...args: any[]) => void
  handle: (
    channel: string,
    callback: (...args: any[]) => any,
    win?: BrowserWindow
  ) => { remove: () => void }
  on: (
    channel: string,
    callback: (event: IpcMainEvent, ...args: any[]) => void,
    win?: BrowserWindow
  ) => {
    remove: () => void
  }
  hooks: HooksInterface

  setAttribute: (win, attr, value) => void
  getAttribute: (win, attr) => any

  plugin: {
    assets: Record<string, string>
  }
}

// Window Controls
type DesktopPluginOptions = {
  load?: (this: DesktopPluginContext, win: BrowserWindow, id: string) => void
  unload?: (this: DesktopPluginContext, win: BrowserWindow, id: string) => void
}

type PluginLoadCallback = (this: IpcRenderer, env: CommonersGlobalObject) => LoadedPlugin // General load behavior

type OptionalPluginBehaviors = {
  assets?: Record<string, string>
  after?: string[] // Plugin IDs that must complete their ready() hooks before this plugin's ready() runs
  unload?: (env: CommonersGlobalObject) => void // Called when a plugin is unloaded (dev hot reload or window close)
  start?: Lazy<(this: DesktopPluginContext, services: ResolvedServices, id: string) => void>
  ready?: Lazy<(this: DesktopPluginContext, services: ActiveServices, id: string) => void>
  quit?: Lazy<(this: DesktopPluginContext, id: string) => void>
}

type IsSupportedOption = false | SupportQuery

export type SupportConfiguration =
  | {
      load?: IsSupportedOption
      start?: IsSupportedOption
      ready?: IsSupportedOption
      quit?: IsSupportedOption
      capacitor?: CapacitorConfig | false // NOTE: This overrides all other support options for mobile builds
    }
  | SupportQuery

export type SupportConfigurationWithCapacitor = Extract<SupportConfiguration, { capacitor?: any }>

// Runs with special behaviors on desktop
type HybridPlugin = {
  capabilities?: ExtensionCapabilities
  isSupported?: SupportConfiguration
  load?: Lazy<PluginLoadCallback>
  desktop: Lazy<DesktopPluginOptions> // Prioritizes desktop support
} & OptionalPluginBehaviors

// Runs on all targets
type BasicPlugin = {
  capabilities?: ExtensionCapabilities
  isSupported?: SupportConfiguration
  load?: Lazy<PluginLoadCallback>
} & OptionalPluginBehaviors

export type Plugin = BasicPlugin | HybridPlugin

// ------------------- Extensions (Unified Plugin/Service) -------------------
// An extension declared via the `extensions` config key.
// Auto-classified as plugin, service, or both based on its properties.
export type Extension = Plugin | UserService

// Internal resolved representation — the canonical store
export type ResolvedExtension = {
  type: 'plugin' | 'service' | 'hybrid'
  capabilities?: ExtensionCapabilities
  plugin?: Plugin // Present when extension has plugin behavior
  service?: ResolvedService // Present when extension has service behavior
}

export type ResolvedExtensions = Record<string, ResolvedExtension>

type ExposedExtension = {
  type: 'plugin' | 'service' | 'hybrid'
  capabilities?: ExtensionCapabilities
}

type ExposedExtensions = Record<string, ExposedExtension>

// type ValidNestedProperty = TargetType | PlatformType | ModeType

// ------------------- Icon -------------------
export type BaseIconType = string | string[] // One or multiple formats
type ValidNestedIconKey = (typeof valid.icon)[number] // | ValidNestedProperty // NOTE: Not yet drilling for the icon

// Complete Recursive Configurations
type IconConfiguration = { [x in ValidNestedIconKey]?: BaseIconType }

export type IconType = BaseIconType | IconConfiguration

// ------------------- PWA -------------------

type PWAOptions = {
  includeAssets?: string[]
  manifest?: Partial<ManifestOptions>
}

// ------------------- Electron -------------------
export type ElectronSecuritySettings = {
  sandbox?: boolean // Enable sandboxing (default: false)
  devTools?: boolean // Enable devTools (default: !isProduction)
  contextIsolation?: boolean // Enable context isolation (default: true)
  nodeIntegration?: boolean // Disable Node.js integration (default: false)
  asarIntegrity?: boolean | { strict?: boolean } // Enable ASAR integrity checks (default: true)
  csp?: string | false | Record<string, string[]> // Content Security Policy override. String for full CSP, object for per-directive overrides, false to disable.
  /**
   * Expected publisher (substring of cert subject) for service binary verification.
   * When set on a signed build, each executable service is verified against the OS
   * code-signing chain (Authenticode on Windows, codesign on macOS) before spawn,
   * and the leaf cert subject must contain this string. Sealed inside app.asar via
   * ASAR integrity, so it cannot be redirected by an attacker. Skipped on platforms
   * without native code signing (Linux). Pair with code-signing in your build
   * pipeline; without signing, every spawn will be rejected.
   */
  expectedPublisher?: string
}

export type ElectronOptions = {
  splash?: string
  window?: BrowserWindowConstructorOptions
  protocol?: string | CustomScheme
  build?: ElectronBuilderConfiguration
  security?: boolean | ElectronSecuritySettings // Whether to use secure builds (default: true)
  // When true (default), a second launch of the app focuses the existing
  // window instead of starting a new instance. Set to false to allow
  // concurrent instances — useful in dev for hot-reloading scenarios where
  // the previous Electron process hasn't released its OS lock yet.
  singleInstance?: boolean
  dev?: {
    load?: 'url' | 'file' // Load the Electron pages from a file or URL
  }
  hooks?: HooksInterface
}

// ------------------- Tauri -------------------
export type TauriSecuritySettings = {
  csp?: string | false
}

export type TauriOptions = {
  window?: {
    title?: string
    width?: number
    height?: number
    fullscreen?: boolean
    resizable?: boolean
    decorations?: boolean
  }
  security?: TauriSecuritySettings
  config?: Record<string, any> // Raw tauri.conf.json overrides
}

type RawPlugins = { [id: string]: Plugin }

// ------------------- Configuration Object Declaration -------------------
export type BaseConfig = {
  root: string // Root of the project (will resolve config file there)

  target: TargetType // Specify the default target platform
  outDir: string // Specify the default output directory

  hooks?: HooksInterface | (() => HooksInterface) // Hooks interface for CLI integration

  public?: boolean
  port?: PortType // Specify the port for Start and Launch commands

  // Common Options
  appId: string
  icon: IconType

  // Package Properties
  name: string
  version: string
  description?: string
  dependencies?: { [x: string]: string }
  devDependencies?: { [x: string]: string }

  pages: Record<string, string> // Shorthand for vite.build.rollupOptions.input

  // Plugin Options
  plugins: RawPlugins

  // Electron Options
  electron: ElectronOptions

  // Tauri Options
  tauri?: TauriOptions

  vite?: ViteUserConfig | string

  // PWA Options
  pwa: PWAOptions

  // Service Options
  services?: { [x: string]: UserService }

  // Unified Extensions (auto-classified into plugins/services)
  extensions?: { [x: string]: Extension }
}

type BuildOptions = {
  publish?: boolean | PublishOptions['publish']
  sign?: boolean
}

export type UserConfig = Partial<BaseConfig> & { build?: BuildOptions }

type ServiceSelection = string | string[]

export type ConfigResolveOptions = {
  services?: ServiceSelection
  build?: boolean
  dev?: boolean
  hooks?: HooksInterface | (() => HooksInterface) // Hooks interface for CLI integration
}

// NOTE: No need for configuration-related options
export type LaunchConfig = {
  root: BaseConfig['root']
  target: BaseConfig['target']
  outDir?: BaseConfig['outDir']
  services?: BaseConfig['services']

  // Server + Service Options
  public?: BaseConfig['public']
  port?: BaseConfig['port']
  hooks?: BaseConfig['hooks'] // Hooks interface for CLI integration
}

export type ServiceRebuildOption = boolean | string[]

export type BuildHooks = {
  services?: ResolvedServices
  onBuildAssets?: (...args: unknown[]) => void
  dev?: boolean
  rebuildServices?: ServiceRebuildOption
  overwrite?: boolean // Overwrite existing files
  hooks?: HooksInterface // Hooks interface for CLI integration
}

export type ServiceBuildOptions = {
  dev?: boolean
  outDir?: string
  services?: ServiceSelection
  rebuild?: ServiceRebuildOption
  hooks?: HooksInterface // Hooks interface for CLI integration
}

export type ServiceManifestEntry = {
  src?: string
  filepath?: string
  compile: any // Truthy if compilable — may be object { from, to } or boolean
  autobuild: any // Truthy if auto-built
  executable: boolean
  wasm: boolean
  capabilities?: ExtensionCapabilities
  hash?: string // SHA256, populated after build
}

export type ServiceManifest = Record<string, ServiceManifestEntry>

export type ResolvedConfig = Omit<BaseConfig, 'hooks' | 'plugins' | 'services'> & {
  build?: BuildOptions
  hooks: HooksInterface // Resolved hooks interface

  // Unified extensions — the sole internal store
  extensions: ResolvedExtensions

  // Declarative service manifest — build-time metadata for all services
  serviceManifest: ServiceManifest

  // package.json properties used in the library
  type?: 'module' | 'commonjs'
  dependencies?: { [x: string]: string }
  devDependencies?: { [x: string]: string }
  peerDependencies?: { [x: string]: string }
  optionalDependencies?: { [x: string]: string }
}

// ------------------- Global Object Declaration -------------------

type ExposedService = {
  url: string
  filepath: string
  capabilities?: ExtensionCapabilities
}

type ExposedServices = {
  [x: string]: ExposedService
}

type ExposedDesktopServices = {
  [x: string]: ExposedService & {
    onClosed: () => void
    close: () => void
    status: ServiceStatus
    capabilities?: ExtensionCapabilities
  }
}

type ExposedPlugins = {
  [x: string]: LoadedPlugin
}

type WS_URL = string

type ExtensionMatch = {
  type: 'plugin' | 'service' | 'hybrid'
  capabilities: ExtensionCapabilities
}

type BaseCommonersGlobalObject = {
  NAME: string
  VERSION: string
  PLUGINS: ExposedPlugins
  EXTENSIONS: ExposedExtensions
  READY: Promise<ExposedPlugins>

  TARGET: SpecificTargetType
  DEV: false | WS_URL
  PROD: boolean

  ENV: Record<string, any> // Environment Variables loaded using Vite

  PAGES: Record<string, (options: { search?: string; hash?: string }) => void>

  ROOT: string

  CAPABILITIES: {
    services: Record<string, ExtensionCapabilities>
    plugins: Record<string, ExtensionCapabilities>
  }
  query: (filter: Partial<ExtensionCapabilities>) => Record<string, ExtensionMatch>

  events?: CommonersEvents // Cross-window events (via @commoners/messaging plugin)
  is: (check: string) => boolean // Runtime detection

  __READY: (...args: unknown[]) => void // Resolve Function
  __PLUGINS?: RawPlugins // Raw Plugins
}

export type CommonersGlobalObject =
  | (BaseCommonersGlobalObject & {
      DESKTOP: false
      MOBILE: boolean
      WEB: boolean
      SERVICES: ExposedServices
    })
  | (BaseCommonersGlobalObject & {
      DESKTOP: ElectronTransferableBrowserWindowFlags & {
        quit: () => void
        close: () => void
      }
      MOBILE: false
      WEB: false
      SERVICES: ExposedDesktopServices
    })

declare global {
  const commoners: CommonersGlobalObject
}

// ------------------- Electron -------------------
type ElectronWindowCreationCallback = (this: typeof Electron, win: BrowserWindow) => any
type BaseElectronWindowOptions = Electron.BrowserWindowConstructorOptions & {
  onInitialized?: ElectronWindowCreationCallback
}
export type ElectronWindowOptions =
  | BaseElectronWindowOptions
  | ((this: typeof Electron | void) => BaseElectronWindowOptions)

type ElectronTransferableBrowserWindowFlags = {
  __id: number
  __main: boolean
}

export type ElectronBrowserWindowFlags = {
  __show: boolean
  __listeners: any[]
  __loading: Record<string, any>
  __loaded: Promise<void>
  __ready: Promise<void>
} & ElectronTransferableBrowserWindowFlags

export type ExtendedElectronBrowserWindow = BrowserWindow & ElectronBrowserWindowFlags

// ------------------- Events -------------------
export type CommonersEvents = {
  emit: (topic: string, data?: any) => void
  on: (topic: string, cb: (data: any) => void) => () => void
  off: (topic: string, cb: (data: any) => void) => void
  once: (topic: string, cb: (data: any) => void) => () => void
}

// ------------------- Health Monitoring -------------------
export type ServiceHealthStatus = 'unknown' | 'healthy' | 'unhealthy' | 'restarting' | 'stopped'

export type HealthMonitorConfig = {
  interval?: number // ms between health checks (default: 30000)
  timeout?: number // ms before a check is considered failed (default: 5000)
  retries?: number // consecutive failures before marking unhealthy (default: 3)
  autoRestart?: boolean // auto-restart unhealthy services (default: false)
}
