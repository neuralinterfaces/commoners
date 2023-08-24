import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { config as resolvedConfig } from "../../../globals"

import { extname, join } from "node:path"

export const create = () => {
    const parentPath = 'resources'
    let iconInfo = { 
        default: typeof resolvedConfig.icon === 'string' ? resolvedConfig.icon : (resolvedConfig.icon.light ?? resolvedConfig.icon.dark ?? Object.values(resolvedConfig.icon).find(o => typeof o === 'string')),
        parent: {
            path: parentPath,
            existed: existsSync(parentPath)
        }, 
        light: {}, 
        dark: {} 
    }
    
    // Create icons
    const { light, dark, parent, default: iconDefault } = iconInfo
    if (iconDefault) {
        light.src = resolvedConfig.icon?.light ?? iconDefault
        dark.src = resolvedConfig.icon?.dark ?? iconDefault
        light.to = join(parent.path, 'logo' + extname(light.src))
        dark.to  = join(parent.path, 'logo-dark' + extname(light.src))
        if (!parent.existed) mkdirSync(parent.path, { recursive: true });
        cpSync(dark.src, light.to)
        cpSync(dark.src, dark.to)
    }

    return iconInfo

}

export const cleanup = ({ light, dark, parent }) => {
    rmSync(light.to)
    rmSync(dark.to)
    if (!parent.existed) rmSync(parent.path, { recursive: true, force: true })
}
