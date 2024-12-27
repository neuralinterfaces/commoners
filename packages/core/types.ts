import electron, { BrowserWindow, BrowserWindowConstructorOptions, IpcMainEvent, IpcRenderer } from 'electron'
import * as utils from '@electron-toolkit/utils'

type ViteUserConfig = import('vite').UserConfig
type ElectronBuilderConfiguration = import('electron-builder').Configuration
type PublishOptions = import('electron-builder').PublishOptions

type ManifestOptions = import ('vite-plugin-pwa').ManifestOptions

export function tuple<T extends string[]>(...o: T) {
    return o;
}


export type PortType = number
export type LocalHostType =  'localhost' | '0.0.0.0'

export type ServiceOptions = string | string[]

export type ServiceCreationOptions = {
    root?: string, 
    target?: string
    services?: string | string[],
    build?: boolean,
    onLog?: Function
    onClosed?: Function
}

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export type WritableElectronBuilderConfig = DeepWriteable<ElectronBuilderConfiguration>

// ------------------- Support -------------------
export const validMobileTargets =  ['ios', 'android', 'mobile']

export const validDesktopTargets = ['desktop', 'electron', 'tauri']

export const universalTargetTypes = ['desktop', 'mobile',  'pwa', 'web']

export const valid = {

    // Derived
    target: tuple(...Array.from(new Set(...universalTargetTypes, ...validDesktopTargets, ...validMobileTargets))), // NOTE: Really these should transform to the relevant universal type

    // Internal
    command: tuple('start', 'dev', 'build', 'launch'),

    // Configuration
    icon: tuple('light', 'dark'),

}

export type ViteOptions = { dev?: boolean }
export type ServerOptions = { printUrls?: boolean }

export type TargetType = typeof valid.target[number]
// export type PlatformType = typeof validDesktopTargets[number]

// ------------------- Services -------------------
type BaseServiceMetadata = { src: string } | { url: string } 

export type PackageBuildInfo = {
    name: string,
    force?: boolean,
    src: string, // Absolute Source File
    out: string, // Absolute Output File
}

type UserBuildCommand = string | ((info: PackageBuildInfo) => string | Promise<string>) // e.g. could respond to platform or manually build the executable


type _ExtraServiceMetadata = {
    host?: string,
    port?: number,
    build?: UserBuildCommand
}

type _ServiceMetadata = string | false | (BaseServiceMetadata & _ExtraServiceMetadata)

type PublishSelectiveOptions = {
    local?: Partial<_ServiceMetadata>,
    remote?: Partial<_ServiceMetadata>
}

type ExtraServiceMetadata = _ExtraServiceMetadata & {
    publish?: (Partial<_ServiceMetadata> & { base?: string } & PublishSelectiveOptions)
}

export type UserService = string | (BaseServiceMetadata & ExtraServiceMetadata) // Can nest build by platform type


type ServiceStatus = null | boolean
export type ResolvedService = {

    // For Service Build
    filepath: string,
    base: string | null,
    build: ExtraServiceMetadata['build'],
    __src: string
    __compile: boolean,
    __autobuild: boolean

    // For Client
    url: string // What URL to use for service requests

    status: ServiceStatus,
}

// ------------------- Plugins -------------------
type BaseLoadedPlugin = { [x:string]: any } | Function | any
type LoadedPlugin = BaseLoadedPlugin | Promise<BaseLoadedPlugin>

type SupportQuery = (() => boolean | Promise<boolean>)
type SupportCheck = boolean | SupportQuery
type FalseOrQuery = false | SupportQuery

type TagName = string
type TagAttribute = Record<string, string>

export type CapacitorConfig = {
    name: string,
    plugin: string,
    options?: any,
    plist?: Record<string, any>,
    manifest?: Record<TagName, TagAttribute[]>
}

type MobileCapacitorCheck = { capacitor?: CapacitorConfig } 

type DesktopPluginContext = {
    id: string,
    electron: typeof electron,
    utils: typeof utils,
    createWindow: (page: string, opts: BrowserWindowConstructorOptions) => BrowserWindow
    // open: () => app.whenReady().then(() => globals.firstInitialized && (restoreWindow() || createMainWindow())),
    send: (channel: string, ...args: any[]) => void,
    on: (channel: string, callback: (event: IpcMainEvent, ...args: any[]) => void, win: BrowserWindow) => ({
        remove: () => void
    }),

    setAttribute: (win, attr, value) => void,
    getAttribute: (win, attr) => any,

    // Provide specific variables from the plugin
    plugin: {
      assets: Record<string, string>
    }
}

type DesktopPluginOptions = {

    // App Controls
    start?: (this: DesktopPluginContext, id: string) => void,
    ready?: (this: DesktopPluginContext, services: ResolvedServices, id: string) => void,
    quit?: (this: DesktopPluginContext, id: string) => void,

    
    // Window Controls
    load?: (this: DesktopPluginContext, win: BrowserWindow, id: string) => void,
    unload?: (this: DesktopPluginContext, win: BrowserWindow, id: string) => void,
}

type PluginLoadCallback = (this: IpcRenderer) => LoadedPlugin // General load behavior

// Runs with special behaviors on desktop
type HybridPlugin = {
    isSupported?: {
        web?: boolean | SupportQuery, // Assumed to be false
        desktop?: SupportQuery, // Cannot be false. Assumed to be true
        mobile?: boolean | SupportQuery | MobileCapacitorCheck // Assumed to be false.
    }
    load?: PluginLoadCallback,
    desktop: DesktopPluginOptions // Prioritizes desktop support
}

// Runs only on remote targets (web, mobile)
type RemotePlugin = {
    isSupported: { web?: SupportCheck, desktop: boolean, mobile?: SupportCheck | MobileCapacitorCheck },
    load: (this: IpcRenderer) => LoadedPlugin
}

// Runs on all targets
type BasicPlugin = { 
    isSupported?: { web?: FalseOrQuery, desktop?: FalseOrQuery, mobile?: FalseOrQuery | MobileCapacitorCheck },
    load: (this: IpcRenderer) => LoadedPlugin 
}

export type Plugin = BasicPlugin | HybridPlugin | RemotePlugin

// type ValidNestedProperty = TargetType | PlatformType | ModeType

// ------------------- Icon -------------------
type BaseIconType = string //| {[x in PlatformType]?: string}
type ValidNestedIconKey = typeof valid.icon[number] // | ValidNestedProperty // NOTE: Not yet drilling for the icon

// Complete Recursive Configurations
type IconConfiguration = {[x in ValidNestedIconKey]?: BaseIconType }

export type IconType = BaseIconType | IconConfiguration

// ------------------- PWA -------------------

type PWAOptions = {
    includeAssets?: string[],
    manifest?: Partial<ManifestOptions>
}

// ------------------- Electron -------------------
type ElectronOptions = {
    splash?: string,
    window?: BrowserWindowConstructorOptions,
    build?: ElectronBuilderConfiguration
}

type RawPlugins = {[id: string]: Plugin}

// ------------------- Configuration Object Declaration -------------------
export type BaseConfig = {
    
    root: string // Root of the project (will resolve config file there)

    target: TargetType, // Specify the default target platform
    outDir: string, // Specify the default output directory

    host?: LocalHostType
    port?: PortType, // Specify the port for Start and Launch commands

    // Common Options
    appId: string,
    icon: IconType,

    // Package Properties
    name: string,
    version: string,
    description?: string,
    dependencies?: {[x:string]: string}
    devDependencies?: {[x:string]: string}

    pages: Record<string, string>, // Shorthand for vite.build.rollupOptions.input

    // Plugin Options
    plugins: RawPlugins,

    // Electron Options
    electron: ElectronOptions
    vite?: ViteUserConfig | string

    // PWA Options
    pwa: PWAOptions

    // Service Options
    services?: { [x: string]: UserService }
}

type BuildOptions = {
    publish?: boolean | PublishOptions['publish'],
    sign?: boolean
}

export type UserConfig = Partial<BaseConfig> & { build?: BuildOptions }

type ServiceSelection = string | string[]

export type ConfigResolveOptions = {
    services?: ServiceSelection
    build?: boolean
}


// NOTE: No need for configuration-related options
export type LaunchConfig = {
    root: BaseConfig["root"],
    target: BaseConfig["target"],
    outDir: BaseConfig["outDir"],
    services: BaseConfig["services"],

    // Server + Service Options
    host: BaseConfig["host"],
    port: BaseConfig["port"]
}

export type BuildHooks = {
    services?: ResolvedConfig['services']
    onBuildAssets?: Function,
    dev?: boolean
}

export type ServiceBuildOptions = {
    dev?: boolean,
    outDir?: string,
    services?: ServiceSelection
}

type ResolvedServices = { [x: string]: ResolvedService } 
export type ResolvedConfig = BaseConfig & {

    build?: BuildOptions

    services: ResolvedServices

    // package.json properties used in the library
    type?: 'module' | 'commonjs',
    dependencies?: { [x:string]: string }
    devDependencies?: { [x:string]: string }
    peerDependencies?: { [x:string]: string }
    optionalDependencies?: { [x:string]: string }
}

// ------------------- Global Object Declaration -------------------

type ExposedService = {
    url: string,
    filepath: string
}

type ExposedServices = {
    [x:string]: ExposedService
}

type ExposedDesktopServices = {
    [x:string]: ExposedService & { 
        onClosed: () => void, 
        close: () => void,
        status: ServiceStatus
    }
}


type ExposedPlugins = {
    [x:string]: LoadedPlugin
}

type BaseCommonersGlobalObject = {
    NAME: string,
    VERSION: string,
    PLUGINS: ExposedPlugins,
    READY: Promise<ExposedPlugins>,

    DEV: boolean,
    PROD: boolean,

    ENV: Record<string, any>, // Environment Variables loaded using Vite

    PAGES: Record<string, (options: { search?: string, hash?: string }) => void>,

    ROOT: string,

    __READY: Function, // Resolve Function
    __PLUGINS?: RawPlugins // Raw Plugins
}

export type CommonersGlobalObject = (BaseCommonersGlobalObject & {
    DESKTOP: false,
    MOBILE: boolean,
    WEB: boolean,
    SERVICES: ExposedServices,
}) | (BaseCommonersGlobalObject & {
    DESKTOP:  ElectronTransferableBrowserWindowFlags & {
        quit: () => void,
    },
    MOBILE: false,
    WEB: false,
    SERVICES: ExposedDesktopServices
})

declare global {
    const commoners: CommonersGlobalObject
  }

// ------------------- Electron -------------------
type ElectronWindowCreationCallback = (this: typeof Electron, win: BrowserWindow) => any
type BaseElectronWindowOptions = Electron.BrowserWindowConstructorOptions & { onInitialized?: ElectronWindowCreationCallback }
export type ElectronWindowOptions = BaseElectronWindowOptions | (( this: typeof Electron | void ) => BaseElectronWindowOptions)

type ElectronTransferableBrowserWindowFlags =  {
    __id: number;
    __main: boolean
}

export type ElectronBrowserWindowFlags = {
    __show: boolean;
    __listeners: any[];
    __loading: Record<string, any>;
    __loaded: Promise<void>;
    __ready: Promise<void>;
} & ElectronTransferableBrowserWindowFlags

export type ExtendedElectronBrowserWindow = BrowserWindow & ElectronBrowserWindowFlags