import { App, BrowserWindow, BrowserWindowConstructorOptions, IpcMain, IpcRenderer } from 'electron'
import { Configuration as ElectronBuilderConfiguration, PublishOptions } from 'electron-builder'
import { ManifestOptions } from 'vite-plugin-pwa'

import { UserConfig as ViteUserConfig } from 'vite'

export function tuple<T extends string[]>(...o: T) {
    return o;
}


type OutDirType = string

export type PortType = number

export type ServiceOptions = string | string[]

export type ServiceCreationOptions = {
    root?: string, 
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
    command: tuple('start', 'dev', 'build', 'launch', 'share'),

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
type BaseServiceMetadata = ({ src: string, base?: string } | { url: URLConfiguration })


type UserBuildCommand = string | ((info: { 
    name: string, 
    force: boolean,
    src: string,
    base: string
} ) => string) // e.g. could respond to platform or manually build the executable

type ExtraServiceMetadata = {
    port?: number,
    build?: UserBuildCommand
}

type ExtraResolvedServiceMetadata = ExtraServiceMetadata & {
    build: ExtraServiceMetadata['build'] | {
        src: string,
        base: string,
    },
    __src?: string
}

type PublishedServiceMetadata = { 
    publish?: any // Partial<UserService>
}

type GeneratedServiceMetadata = {
    filepath: string,
    url: string
    host: string,
    compile?: true
}

export type UserService = string | (BaseServiceMetadata & ExtraServiceMetadata & PublishedServiceMetadata) // Can nest build by platform type

export type ResolvedService = BaseServiceMetadata & ExtraResolvedServiceMetadata & GeneratedServiceMetadata

// ------------------- Plugins -------------------
type LoadedPlugin = { [x:string]: any } | Function | any

type ResolvedSupportType = boolean | any // Evaluated as boolean
type UserSupportType = ResolvedSupportType | (() => ResolvedSupportType)

export type SupportConfigurationObject = {
    [x in TargetType]?: UserSupportType
} & {
    mobile?: boolean | {
        capacitor?: any // Capacitor Plugin Configuration Object
    }
}

export type Plugin = {

    isSupported?: ResolvedSupportType | SupportConfigurationObject
    
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
type BaseConfig = {
    
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
    share?: ShareOptions['share'],
    build?: BuildOptions['build']
}

export type ShareOptions = Partial<BaseConfig> & {
    share?: {
        port: PortType,
        services?: ServiceOptions
    }
}

// NOTE: No need for configuration-related options
export type LaunchOptions = {
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

export type ResolvedConfig = BaseConfig & {
    build: BuildOptions['build'],
    launch?: LaunchOptions,
    share?: ShareOptions['share'],
    services: {
        [x: string]: ResolvedService
    }
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
        onActive: () => void,
        onClosed: () => void,
    }
}

type ExposedPlugins = {
    [x:string]: LoadedPlugin
}

type BaseCommonersGlobalObject = {
    name: string,
    version: string,
    plugins: ExposedPlugins,
    ready: Promise<ExposedPlugins>,
    __ready: Function, // Resolve Function
    __plugins?: RawPlugins // Raw Plugins
}

export type CommonersGlobalObject = (BaseCommonersGlobalObject & {
    target: TargetType,
    services: ExposedServices,
}) | (BaseCommonersGlobalObject & {
    target: 'desktop',
    services: ExposedDesktopServices,
    quit: () => void,
})

declare global {
    const commoners: CommonersGlobalObject
  }