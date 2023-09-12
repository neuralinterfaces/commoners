import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"

import { extname, join } from "node:path"
import { getIcon } from "../utils/index.js"
import { valid, ResolvedConfig } from "../types.js"

export const has = (config: ResolvedConfig) => !!config.icon

export const create = (config: ResolvedConfig) => {
    const parentPath = 'resources'

    if (!has(config)) return

    let iconInfo = { 
        default: getIcon(config.icon),
        parent: {
            path: parentPath,
            existed: existsSync(parentPath)
        }, 
        light: {}, 
        dark: {} 
    } as any

    // Create icons
    const { light, dark, parent, default: iconDefault } = iconInfo
    if (iconDefault) {
        light.src = config.icon?.[valid.icon[0]] ?? iconDefault
        dark.src = config.icon?.[valid.icon[1]] ?? iconDefault
        light.to = join(parent.path, 'logo' + extname(light.src))
        dark.to  = join(parent.path, 'logo-dark' + extname(light.src))
        if (!parent.existed) mkdirSync(parent.path, { recursive: true });
        cpSync(dark.src, light.to)
        cpSync(dark.src, dark.to)
    }

    return iconInfo

}

export const cleanup = (info) => {
    if (!info) return
    const { light, dark, parent } = info
    rmSync(light.to)
    rmSync(dark.to)
    if (!parent.existed) rmSync(parent.path, { recursive: true, force: true })
}
