export type Service = { 
    name: string,
    src: string,
    description?: string,
    host?: string | "0.0.0.0"
    port?: number,
    publish?: any
}

