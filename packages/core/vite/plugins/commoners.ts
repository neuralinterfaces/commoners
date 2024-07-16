
import { extname, resolve } from 'node:path'
import { getIcon } from '../../utils/index.js'
import { normalizeTarget } from '../../globals.js'

import { getAssetLinkPath } from '../../utils/assets.js'

const virtualModuleId = 'commoners:env'
const ENV_VAR_NAMES = [ 'NAME', 'VERSION', 'ICON', 'SERVICES', 'TARGET', 'READY', 'PLUGINS', 'DESKTOP' ]

const headStartTag = '<head>'

export default ({ 
    config, 
    build, 
    outDir,
    target,
    dev
}) => {
    
    // const orginalBase = normalize(config.vite?.base ?? '/').replaceAll(sep, posix.sep)

    // const base = orginalBase[0] === posix.sep ? orginalBase.slice(1) : orginalBase
    // const nToAdjust = base.split(posix.sep).length - 1

    // outDir = (config.root ? relative(config.root, outDir) : outDir) // outDir should be relative to the root
    // if (nToAdjust) outDir = [...Array.from({length: nToAdjust}, () => '..'), ...outDir.split(posix.sep)].join(posix.sep)
    
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
        TARGET: normalizeTarget(target),
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

                commonersGlobalVariable.DESKTOP = {}

                if (quit)  commonersGlobalVariable.DESKTOP.quit = quit
                if (electron) commonersGlobalVariable.DESKTOP.electron = electron

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