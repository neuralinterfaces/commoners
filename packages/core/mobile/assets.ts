import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"

import { extname, join, resolve } from "node:path"
import { getIcon } from "../assets/utils/icons.js"

import { removeDirectory } from '../utils/files.js'
import { valid, ResolvedConfig } from "../types.js"

export const has = (config: ResolvedConfig) => !!config.icon

export const create = (config: ResolvedConfig) => {

    const parentPath = 'resources'

    if (!has(config)) return

    const { root } = config

    const rawIconSrc = getIcon(config.icon)

    let iconInfo = { 
        default: rawIconSrc ? resolve(root, rawIconSrc) : null,
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
        const lightSrc = getIcon(config.icon, { type: valid.icon[0] })
        const darkSrc = getIcon(config.icon, { type: valid.icon[1] })
        light.src = lightSrc ? resolve(root, lightSrc) : iconDefault
        dark.src = darkSrc ? resolve(root, darkSrc) : iconDefault
        light.to = join(parent.path, 'logo' + extname(light.src))
        dark.to = join(parent.path, 'logo-dark' + extname(light.src))
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
    if (!parent.existed) removeDirectory(parent.path)
}
