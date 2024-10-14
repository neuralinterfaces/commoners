
import { extname, join, resolve } from 'node:path'
import { getIcon } from '../../utils/index.js'
import { isDesktop, isMobile } from '../../globals.js'

import { getAssetLinkPath } from '../../utils/assets.js'
import { ResolvedConfig } from '../../types.js'
import { UserConfig } from 'vite'

const virtualModuleId = 'commoners:env'

const ENV_VAR_NAMES = [ 
    'NAME', 
    'VERSION', 
    'ICON', 
    'SERVICES', 

    'READY', 
    'PLUGINS', 

    'DESKTOP',
    'MOBILE',
    'WEB', 

    'DEV',
    'PROD',
]


const TAGS = {
    head: {
        start: '<head>',
        end: '</head>'
    }
}

type CommonersPluginOptions = {
    config: ResolvedConfig
    build: boolean
    outDir: string
    target: string
    dev: boolean
}

export default ({ 
    config, 
    build, 
    outDir,
    target,
    dev
}: CommonersPluginOptions) => {

    const actualOutDir = outDir
    const _assetOutDir = config.build?.outDir
    const assetOutDir = _assetOutDir ?? actualOutDir

    const desktop = isDesktop(target)
    const mobile = isMobile(target)
    
    const configRoot = config.root
    const root = _assetOutDir ? actualOutDir : configRoot
    const relTo = build ? assetOutDir : root

    const updatedConfigURL = getAssetLinkPath('commoners.config.mjs', assetOutDir, relTo)

    const services = Object.entries(config.services).reduce((acc, [ 
        id, 
        { url } 
    ]) => {

        acc[id] = {}
        if (url) acc[id].url = url.replace('0.0.0.0', 'localhost')// Replace public with local IP

        return acc
    }, {})

    const rawIconSrc = getIcon(config.icon)
    const resolvedIcon = rawIconSrc ? resolve(configRoot, rawIconSrc) : null
    const iconPath = resolvedIcon ? getAssetLinkPath(resolvedIcon, assetOutDir, relTo) : null

    console.log('IS DEV', target, dev)

    const globalObject = {

        NAME: config.name,
        VERSION: config.version,
        ICON: iconPath,
        SERVICES: services,

        // Target Shortcuts
        DESKTOP: desktop,
        MOBILE: mobile,
        WEB: !desktop && !mobile,

        // Production vs Development
        DEV: dev,
        PROD: !dev,
    }
    
    const faviconLink = rawIconSrc ? `<link rel="shortcut icon" href="${iconPath}" type="image/${extname(iconPath).slice(1)}" >` : ''
    
    const resolvedVirtualModuleId = '\0' + virtualModuleId

    return {
        name: 'commoners',
        resolveId(id) {
            if (id === virtualModuleId)  return resolvedVirtualModuleId
        },
        load(id) {
            if (id === resolvedVirtualModuleId) {
                return `const ENV = globalThis.commoners;\n${ENV_VAR_NAMES.map(name => `export const ${name} = ENV.${name}`).join('\n')}\nexport default ENV`
            }
        },
        transformIndexHtml(html) {

            const headStart = html.indexOf(TAGS.head.start)
            const headEnd = html.indexOf(TAGS.head.end)
            const headContent = headStart && headEnd ? html.slice(headStart + TAGS.head.start.length, headEnd) : ''
            const beforeHead = headStart ? html.slice(0, headStart) : ''
            const afterHead = headEnd ? html.slice(headEnd + TAGS.head.end.length) : ''

            const lowPriority = `
                <title>${config.name}</title>
                ${faviconLink}
            `

            const highPriority = `
                <script type="module">

                // Directly import the plugins from the transpiled configuration object
                import COMMONERS_CONFIG from "${updatedConfigURL}"
                const { plugins } = COMMONERS_CONFIG
                
                // Set global variable
                const { 
                    services, 
                    send,
                    quit,
                    electron
                } = globalThis.__commoners ?? {} // Grab temporary variables


                const commonersGlobalVariable = globalThis.commoners = {}

                const globalObject = JSON.parse(\`${JSON.stringify(globalObject)}\`)
                Object.keys(globalObject).forEach(key => commonersGlobalVariable[key] = globalObject[key])

                if (commonersGlobalVariable.DESKTOP) {
                    commonersGlobalVariable.DESKTOP = {}
                    if (quit)  commonersGlobalVariable.DESKTOP.quit = quit
                    if (electron) commonersGlobalVariable.DESKTOP.electron = electron
                }

                if (plugins) commonersGlobalVariable.__PLUGINS = plugins
                if (services) commonersGlobalVariable.SERVICES = services // Replace with sanitized services from Electron if available

                commonersGlobalVariable.READY = new Promise(res => {
                    const ogRes = res
                    res = (...args) => {
                        ogRes(...args)
                        delete commonersGlobalVariable.__READY
                        if (send) send('commoners:ready')
                    }
                    
                    commonersGlobalVariable.__READY = res
                })    

                import("${getAssetLinkPath('onload.mjs', assetOutDir, relTo)}")

            </script>\n
            `

            return `${beforeHead}${TAGS.head.start}${highPriority}${headContent}${lowPriority}${TAGS.head.end}${afterHead}`
            
        }
    }
}