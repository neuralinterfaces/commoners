import { ResolvedConfig, valid } from '../types.js'

const isIconString = (o) => {
    return typeof o === 'string'
}

export const getIcon = (icon: ResolvedConfig['icon']) => {
    if (icon) {
        if (typeof icon === 'string') return icon
        else {
            const found = valid.icon.find(str => isIconString(icon[str]))
            return icon[found] || Object.values(icon).find(isIconString)
        }
    } 
}