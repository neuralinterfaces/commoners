import { BrowserWindow, BrowserWindowConstructorOptions, IpcMain, IpcRenderer } from 'electron'
import { Configuration as ElectronBuilderConfiguration, PublishOptions } from 'electron-builder'
import { ManifestOptions } from 'vite-plugin-pwa'

export function tuple<T extends string[]>(...o: T) {
    return o;
}

type AnyObj = { [x:string]: any }

type OutDirType = string

export type PortType = number

export type StartOptions = BuildOptions  & { port: PortType }

export type ServiceOptions = boolean | string | string[]

export type BuildOptions = {
    target: TargetType,
    frontend?: boolean,
    services?: ServiceOptions,
    publish?: boolean | PublishOptions['publish'],
    outDir?: string
}

export type ShareOptions = {
    port?: PortType,
    services?: ServiceOptions
}

export type LaunchOptions = {
    target: TargetType,
    outDir?: OutDirType
    port?: PortType
}

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export type WritableElectronBuilderConfig = DeepWriteable<ElectronBuilderConfiguration>

// ------------------- Support -------------------
export const validMobileTargets =  ['ios', 'android']

export const validDesktopTargets = ['mac', 'windows', 'linux']

export const universalTargetTypes = ['desktop', 'mobile',  'pwa', 'web']

export const valid = {

    // Derived
    target: tuple(...universalTargetTypes, ...validDesktopTargets, ...validMobileTargets),
    mode:  tuple('development', 'local', 'remote'),

    // Internal
    command: tuple('start', 'dev', 'build', 'launch', 'share'),

    // Configuration
    icon: tuple('light', 'dark'),

}

export type ViteOptions = {
    outDir?: string,
    target?: TargetType
}

export type ServerOptions = {
    printUrls?: boolean
} & ViteOptions


export type TargetType = typeof valid.target[number]
export type ModeType = typeof valid.mode[number]
// export type PlatformType = typeof validDesktopTargets[number]


// ------------------- Services -------------------
type LocalServiceMetadata = { src: string }
type RemoteServiceMetadata = { url: string }

type BaseServiceMetadata = (LocalServiceMetadata | RemoteServiceMetadata)
type ExtraServiceMetadata = {
    // Common
    port?: number,
    build?: string | (() => string), // e.g. could respond to platform
    extraResources?: ElectronBuilderConfiguration['extraResources'], // NOTE: Replace with electron-builder type
}

type PublishedServiceMetadata = { 
    publish?: Partial<UserService> & {
        local?: Partial<UserService>,
        remote?: Partial<UserService>,
    }
}

type GeneratedServiceMetadata = {
    abspath: string,
    url: string
    host: string,
}

export type UserService = string | (BaseServiceMetadata & ExtraServiceMetadata & PublishedServiceMetadata) // Can nest build by platform type

type ResolvedService = BaseServiceMetadata & ExtraServiceMetadata & GeneratedServiceMetadata

// ------------------- Plugins -------------------
type LoadedPlugin = { [x:string]: any }

type ResolvedSupportType = boolean | any // Evaluated as boolean
type UserSupportType = ResolvedSupportType | (() => ResolvedSupportType)

export type SupportConfigurationObject = {
    [x in TargetType]?: UserSupportType
} & {
    mobile?: {
        capacitor?: any // Capacitor Plugin Configuration Object
    }
}

export type PluginType = {
    name: string,
    isSupported?: ResolvedSupportType | SupportConfigurationObject
    
    loadDesktop?: (this: IpcMain, win: BrowserWindow) => void, // TO PASS TO RENDER
    load?: (this: IpcRenderer) => LoadedPlugin
}

// type ValidNestedProperty = TargetType | PlatformType | ModeType

// ------------------- Icon -------------------
type BaseIconType = string //| {[x in PlatformType]?: string}
type ValidNestedIconKey = typeof valid.icon[number] // | ValidNestedProperty // NOTE: Not yet drilling for the icon

// Complete Recursive Configurations
type IconConfiguration = {[x in ValidNestedIconKey]?: BaseIconType }

type IconType = BaseIconType | IconConfiguration

// ------------------- PWA -------------------

type PWAOptions = {
    includeAssets: string[],
    manifest: Partial<ManifestOptions>
}

// ------------------- Electron -------------------
type ElectronOptions = {
    splash?: string,
    window?: BrowserWindowConstructorOptions
}

// ------------------- Configuration Object Declaration -------------------
type BaseConfig = {
    icon: IconType
    plugins: PluginType[],
    electron: ElectronOptions
    pwa: PWAOptions
}

export type UserConfig = Partial<BaseConfig> & {
    services?: { [x: string]: UserService },
}

export type ResolvedConfig = BaseConfig & {
    services: {
        [x: string]: ResolvedService // FIX
    }
}

// ------------------- Global Object Declaration -------------------

type ExposedServices = {
    [x:string]: {
        url: string
    }
}

type ExposedPlugins = {
    loaded: {
        [x:string]: LoadedPlugin
    },
    rendered: {
        [x:string]: AnyObj
    },
}

export type CommonersGlobalObject = {
    TARGET: TargetType,
    plugins: ExposedPlugins,
    services: ExposedPlugins,
    ready: Promise<ExposedPlugins['loaded']>,
    __ready: Function, // Resolve Function
    __plugins: AnyObj // Raw Plugins
}

declare global {
    const COMMONERS: CommonersGlobalObject
  }