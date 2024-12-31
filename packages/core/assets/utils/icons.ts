import { safePath } from './paths.js'

// Copied types
type BaseIconType = string | string[]
function tuple<T extends string[]>(...o: T) {
    return o;
}

const valid = tuple('light', 'dark')
type IconType = BaseIconType | Record<typeof valid[number], BaseIconType>


const isIconValue = (o) => typeof o === 'string' || Array.isArray(o)

export const ELECTRON_PREFERENCE = [ '.jpg', '.jpeg', '.png' ]
export const WEB_FORMAT_PREFERENCE = [ '.svg', ...ELECTRON_PREFERENCE ]

type IconFormatPreferences = string[]

export const ELECTRON_WINDOWS_PREFERENCE = [ '.ico', ...ELECTRON_PREFERENCE ]

const getPreferredIcon = (icon: BaseIconType, preferences: IconFormatPreferences = WEB_FORMAT_PREFERENCE) => {
    if (typeof icon === 'string') return safePath(icon)

    for (const ext of preferences) {
        const found = icon.find(src => src.endsWith(ext))
        if (found) return safePath(found)
    }

    return safePath(icon[Object.keys(icon)[0]])
}

// Get icon safely
type IconOptions = {
    type?: typeof valid.icon[number]
    preferredFormats?: string[]
}

export const getAllIcons = (icon: IconType) => (typeof icon === 'string') ? [icon] : Object.values(icon).flat() // Flatten in case of nesting

export const getIcon = (icon: IconType, options: IconOptions = {}) => {

    if (!icon) return
    
    if (typeof icon === 'string') return safePath(icon)

    const { type, preferredFormats } = options

    if (Array.isArray(icon)) return getPreferredIcon(icon, preferredFormats)

    // Get specified type
    if (type) {
        const found = icon[type]
        return getPreferredIcon(found, preferredFormats)
    }

    // Get first valid icon
    const found = valid.icon.find(str => isIconValue(icon[str]))
    const resolved = found ? icon[found] : Object.values(icon).find(isIconValue)
    return resolved ? getPreferredIcon(resolved, preferredFormats) : resolved
}