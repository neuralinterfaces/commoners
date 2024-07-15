
// const originalRoot = root
// const subRootPath = config.builds[selectedBuild]
// const newRoot = join(originalRoot, subRootPath) // Resolved based on original root

// if (!existsSync(newRoot)){
//     console.error(`The subroot ${chalk.red(subRootPath)} is does not exist for the ${chalk.bold(selectedBuild)} build.`)
//     return
// }

// const subConfig = await loadConfigFromFile(subRootPath)
// root = newRoot

// const transposedConfig = merge(config, {}, {
//     transform: (path, value) => {
//         if (path[0] === 'builds') return undefined
        
//         if (value && typeof value === 'string') {
//             const resolved = join(originalRoot, value)
//             // Relink resolved files from the base root to the sub-root
//             if (existsSync(resolved)) return relative(root, join(originalRoot, value))
//         }
        
//         // Provide original value
//         return value
//     }
// })

// config = merge(subConfig, transposedConfig, { arrays: true }) as UserConfig // Merge sub-config with base config

// const rootConfigPath = resolveConfigPath(process.cwd())
// config.__root = rootConfigPath


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
