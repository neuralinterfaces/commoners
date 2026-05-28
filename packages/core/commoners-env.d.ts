declare module 'commoners:env' {
  export const NAME: string
  export const VERSION: string
  export const ICON: string | null
  export const SERVICES: Record<string, any>
  export const READY: Promise<Record<string, any>>
  export const PLUGINS: Record<string, any>
  export const EXTENSIONS: Record<string, { type: string; capabilities?: any }>
  export const DESKTOP: false | { quit: () => void; close: () => void; __id: number; __main: boolean }
  export const MOBILE: boolean
  export const WEB: boolean
  export const DEV: false | string
  export const PROD: boolean
  export const TARGET: string
  export const ENV: Record<string, any>
  export const PAGES: Record<string, (info?: { search?: string; hash?: string }) => void>
  export const ROOT: string
  export const CAPABILITIES: {
    services: Record<string, any>
    plugins: Record<string, any>
  }
  export function query(filter: any): Record<string, { type: string; capabilities?: any }>
  const commoners: Record<string, any>
  export default commoners
}

declare module 'commoners:wasm' {
  export function isWasmService(service: any): boolean
  export function loadWasmService(service: any): Promise<any>
}
