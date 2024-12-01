
const joinPath = (...paths) => {
    return paths.reduce((acc, path) => {
        if (path.startsWith('.') && !path.startsWith('..')) path = path.slice(1) // Remove leading dot
        if (path.startsWith('/')) path = path.slice(1) // Remove leading slash
        return `${acc}/${path}`
    })
}

const updateConfigBase = (config) => {

    const copy = { ...config }

    const toOldBase = '../..'

    copy.icon = joinPath(toOldBase, config.icon)
    
    copy.services =  Object.entries(config.services).reduce((acc, [name, service])=> {
        if (typeof service === 'string') acc[name] = joinPath(toOldBase, service)
        else {
            const copy = { ...service }
            const ogSrc = copy.src
            if (copy.src) copy.src = joinPath(toOldBase, ogSrc)
            if (typeof copy.build === 'string') copy.build = copy.build.replace(ogSrc, copy.src)
            acc[name] = copy
        }

        return acc

    }, {})

    return copy

}
