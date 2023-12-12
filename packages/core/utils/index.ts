import { join } from 'node:path'
import { ResolvedConfig, valid } from '../types.js'

const isIconString = (o) => {
    return typeof o === 'string'
}

// Functions to handle merging two absolute paths on Windows (e.g. targeting template assets)
export const safePath = (path) => path.replace(/^.*?:/, '')

export const safeJoin = (...paths) => join(paths[0], ...paths.slice(1).map(safePath))

// Get icon safely
export const getIcon = (icon: ResolvedConfig['icon']) => {
    
    if (icon) {
        let res
        if (typeof icon === 'string') res = icon
        else {
            const found = valid.icon.find(str => isIconString(icon[str]))
            res = found ? icon[found] : Object.values(icon).find(isIconString)
        }

        return res ? safePath(res) : res
    } 
}