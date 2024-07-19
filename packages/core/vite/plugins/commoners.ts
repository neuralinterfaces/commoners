
import { extname, resolve } from 'node:path'
import { getIcon } from '../../utils/index.js'
import { isDesktop, isMobile } from '../../globals.js'

import { getAssetLinkPath } from '../../utils/assets.js'

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

const headStartTag = '<head>'

export default ({ 
    config, 
    build, 
    outDir,
    target,
    dev
}) => {

    const desktop = isDesktop(target)
    const mobile = isMobile(target)
    
    const root = config.root
    const relTo = build ? outDir : root
    
    const propsToInclude = [ 'url' ]
    const services = {} 
    Object.entries(config.services).forEach(([id, sInfo]) => {
      const gInfo = services[id] = {}
      propsToInclude.forEach(prop => gInfo[prop] = sInfo[prop])
    })

    const rawIconSrc = getIcon(config.icon)
    const iconPath = rawIconSrc ? getAssetLinkPath(resolve(root, rawIconSrc), outDir, relTo) : null

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

            const splitByHead = html.split(headStartTag)

            const injection = `
                ${faviconLink}
                <script type="module">

                // Directly import the plugins from the transpiled configuration object
                import COMMONERS_CONFIG from "${getAssetLinkPath('commoners.config.mjs', outDir, relTo)}"
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

                import("${getAssetLinkPath('onload.mjs', outDir, relTo)}")

            </script>\n
            `

            return [splitByHead[0] + injection, splitByHead[1]].join(headStartTag)
        }
    }
}