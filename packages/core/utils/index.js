

export const getIcon = (config) => config.icon && (typeof config.icon === 'string' ? config.icon : (config.icon.light ?? config.icon.dark ?? Object.values(config.icon).find(str => typeof str === 'string')))