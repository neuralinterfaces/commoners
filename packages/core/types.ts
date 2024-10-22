import { App, BrowserWindow, BrowserWindowConstructorOptions, IpcMain, IpcRenderer } from 'electron'

type ViteUserConfig = import('vite').UserConfig
type ElectronBuilderConfiguration = import('electron-builder').Configuration
type PublishOptions = import('electron-builder').PublishOptions

type ManifestOptions = import ('vite-plugin-pwa').ManifestOptions

export function tuple<T extends string[]>(...o: T) {
    return o;
}


type OutDirType = string

export type PortType = number

export type ServiceOptions = string | string[]

export type ServiceCreationOptions = {
    root?: string, 
    target?: string
    services, 
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

type BaseViteOptions = {
    outDir: string,
    target?: TargetType,
}

export type ViteOptions = BaseViteOptions & { dev?: boolean }

export type ServerOptions = { printUrls?: boolean } & BaseViteOptions


export type TargetType = typeof valid.target[number]
// export type PlatformType = typeof validDesktopTargets[number]


type URLConfiguration = string | { local: string } | { remote: string }

// ------------------- Services -------------------
type BaseServiceMetadata = ({ src: string } | { url: URLConfiguration })

type ServicePublishInfo = string | { src: string,  base: string }

type UserBuildCommand = string | ((info: { 
    name: string, 
    force: boolean,
    src: string,
    base: string
} ) => string) // e.g. could respond to platform or manually build the executable

type ExtraServiceMetadata = {
    host?: string,
    port?: number,
    build?: UserBuildCommand,
    publish?: ServicePublishInfo
}

export type UserService = string | (BaseServiceMetadata & ExtraServiceMetadata) // Can nest build by platform type

export type ResolvedService = {
    filepath: string,
    base: string | null,
    url: string
    build: ExtraServiceMetadata['build'],
    publish: ServicePublishInfo,
    host: string,
    port: string,
    __src: string
    __compile: boolean,
    __autobuild: boolean
}

// ------------------- Plugins -------------------
type LoadedPlugin = { [x:string]: any } | Function | any

type ResolvedSupportType = boolean | any // Evaluated as boolean
type UserSupportType = ResolvedSupportType | (() => ResolvedSupportType)

type TagName = string
type TagAttribute = Record<string, string>

export type CapacitorConfig = {
    name: string,
    plugin: string,
    options?: any,
    plist?: Record<string, any>,
    manifest?: Record<TagName, TagAttribute[]>
}

export type SupportConfigurationObject = {
    [x in TargetType]?: UserSupportType
} & {
    mobile?: boolean | {
        capacitor?: CapacitorConfig // Capacitor Plugin Configuration Object
    }
}

export type Plugin = {

    isSupported?: SupportConfigurationObject
    
    desktop?: {
        load?: (this: {
            on: IpcMain['on'],
            send: (channel: string, ...args: any[]) => void,
            open: () => {}
        }, win: BrowserWindow) => void, // TO PASS TO RENDER
        
        preload?: (this: {
            app: App,
            open: () => {}
        }) => void, // TO PASS TO MAIN
    }

    load?: (this: IpcRenderer) => LoadedPlugin
}

// type ValidNestedProperty = TargetType | PlatformType | ModeType

// ------------------- Icon -------------------
type BaseIconType = string //| {[x in PlatformType]?: string}
type ValidNestedIconKey = typeof valid.icon[number] // | ValidNestedProperty // NOTE: Not yet drilling for the icon

// Complete Recursive Configurations
type IconConfiguration = {[x in ValidNestedIconKey]?: BaseIconType }

export type IconType = BaseIconType | IconConfiguration

// ------------------- PWA -------------------

type PWAOptions = {
    includeAssets: string[],
    manifest: Partial<ManifestOptions>
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

    target: TargetType,

    builds?: {
        [x: string]: string // Path to root
    }

    // Common Options
    appId: string,
    icon: IconType,

    // Package Properties
    name: string,
    version: string,
    description?: string,
    dependencies?: {[x:string]: string}
    devDependencies?: {[x:string]: string}


    // Plugin Options
    plugins: RawPlugins,

    // Electron Options
    electron: ElectronOptions
    vite?: ViteUserConfig | string

    // PWA Options
    pwa: PWAOptions

    // Service Options
    services?: { [x: string]: UserService } | false,
    port?: PortType, // Default Port (single service)

}

export type UserConfig = Partial<BaseConfig> & {
    launch?: LaunchOptions,
    build?: BuildOptions['build']
}

// NOTE: No need for configuration-related options
export type LaunchOptions = {
    root?: string,
    target: TargetType,
    port?: PortType,
    outDir?: OutDirType
}

export type BuildOptions = Partial<BaseConfig> & {
    build?: {
        target?: TargetType,
        publish?: boolean | PublishOptions['publish'],
        services?: ServiceOptions
        sign?: boolean
        outDir?: OutDirType
    }
}

export type BuildHooks = {
    services?: ResolvedConfig['services']
    onBuildAssets?: Function,
    dev?: boolean
}


export type ResolvedConfig = BaseConfig & {
    build: BuildOptions['build'],
    launch?: LaunchOptions,
    services: { [x: string]: ResolvedService }

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
    [x:string]: ExposedService & { onClosed: () => void }
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


    __READY: Function, // Resolve Function
    __PLUGINS?: RawPlugins // Raw Plugins
}

export type CommonersGlobalObject = (BaseCommonersGlobalObject & {
    DESKTOP: false,
    MOBILE: boolean,
    WEB: boolean,
    SERVICES: ExposedServices,
}) | (BaseCommonersGlobalObject & {
    DESKTOP:  {
        quit: () => void,
    },
    MOBILE: false,
    WEB: false,
    SERVICES: ExposedDesktopServices
})

declare global {
    const commoners: CommonersGlobalObject
  }