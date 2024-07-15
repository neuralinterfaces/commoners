import { join } from 'node:path'
import { ResolvedConfig, valid } from '../types.js'

const isIconString = (o) => {
    return typeof o === 'string'
}

// Functions to handle merging two absolute paths on Windows (e.g. targeting template assets)
export const safePath = (path) => path.replace(/^.*?:/, '')

export const safeJoin = (...paths) => join(paths[0], ...paths.slice(1).map(safePath))

// Get icon safely
export const getIcon = (icon: ResolvedConfig['icon'], type?: typeof valid.icon[number] ) => {
    
    if (icon) {
        if (typeof icon === 'string') return safePath(icon)
        else {

            // Get specified type
            if (type) {
                const found = icon[type]
                if (found) return safePath(found)
            }

            // Get first valid icon
            const found = valid.icon.find(str => isIconString(icon[str]))
            const resolved = found ? icon[found] : Object.values(icon).find(isIconString)
            return resolved ? safePath(resolved) : resolved
        }
    } 
}