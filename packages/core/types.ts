import { BrowserWindow, BrowserWindowConstructorOptions, IpcMain, IpcRenderer } from 'electron'
import { Configuration as ElectronBuilderConfiguration } from 'electron-builder'
import { ManifestOptions } from 'vite-plugin-pwa'

export function tuple<T extends string[]>(...o: T) {
    return o;
}

type AnyObj = { [x:string]: any }

export type BaseOptions = {
    target: TargetType,
    platform: PlatformType
}

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export type WritableElectronBuilderConfig = DeepWriteable<ElectronBuilderConfiguration>

// ------------------- Support -------------------
export const validMobilePlatforms =  tuple('ios', 'android')

export const valid = {

    // Derived
    target: tuple('desktop', 'mobile', 'web'),
    mode:  tuple('development', 'local', 'remote'),
    platform: tuple('mac', 'windows', 'linux', ...validMobilePlatforms),

    // Internal
    command: tuple('start', 'dev', 'build', 'launch', 'commit', 'publish'),

    // Configuration
    icon: tuple('light', 'dark'),

}

type TargetType = typeof valid.target[number]
type ModeType = typeof valid.mode[number]
type PlatformType = typeof valid.platform[number]


// ------------------- Services -------------------
type LocalServiceMetadata = { src: string }
type RemoteServiceMetadata = { url: string }

type BaseServiceMetadata = (LocalServiceMetadata | RemoteServiceMetadata)
type ExtraServiceMetadata = {
    // Common
    port?: number,
    build?: string | {[x in PlatformType]?: string},
    extraResources?: ElectronBuilderConfiguration['extraResources'], // NOTE: Replace with electron-builder type

    // Uncommon
    protocol?: string,
    hostname?: string,
}

type PublishedServiceMetadata = { 
    publish?: Partial<UserService> & {
        local?: Partial<UserService>,
        remote?: Partial<UserService>,
    }
}

type GeneratedServiceMetadata = {
    abspath: string
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
    
    main?: (this: IpcMain, win: BrowserWindow) => void, // TO PASS TO RENDER
    preload?: (this: IpcRenderer) => LoadedPlugin,
    render?: (loaded: LoadedPlugin) => AnyObj
}

type ValidNestedProperty = TargetType | PlatformType | ModeType

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
    icon?: IconType
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
    PLATFORM: PlatformType,
    MODE: ModeType,
    plugins: ExposedPlugins,
    services: ExposedPlugins,
    ready: Promise<void>,
    __ready: Function, // Resolve Function
    __plugins: AnyObj // Raw Plugins
}

declare global {
    const COMMONERS: CommonersGlobalObject
  }