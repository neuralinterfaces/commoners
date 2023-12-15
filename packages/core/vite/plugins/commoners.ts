
import { normalize, posix, extname, relative, sep, join } from 'node:path'
import { getIcon } from '../../utils/index.js'
import { normalizeTarget } from '../../globals.js'

import { safeJoin } from '../../utils/index.js'

const headStartTag = '<head>'

const assetPath = (path, outDir, isBuild) => {
    let outPath = normalize(safeJoin(isBuild ? '' : outDir, path))
    if (!(outPath[0] === sep)) outPath = sep + outPath
    if (!(outPath[0] === '.')) outPath = '.' + outPath
    return outPath.replaceAll(sep, posix.sep)
}

export default ({ 
    config, 
    build, 
    outDir,
    target
}) => {

    const icon = getIcon(config.icon)

    outDir = (config.root ? relative(config.root, outDir) : outDir) // outDir should be relative to the root

    const propsToInclude = [ 'url' ]
    const services = {} 
    Object.entries(config.services).forEach(([id, sInfo]) => {
      const gInfo = services[id] = {}
      propsToInclude.forEach(prop => gInfo[prop] = sInfo[prop])
    })

    const globalObject = {
        name: config.name,
        version: config.version,
        services,
        target: normalizeTarget(target)
    }

    console.log('Creating', icon, outDir, build, config.root)

    const faviconLink = icon ? `<link rel="shortcut icon" href="${assetPath(icon, outDir, build)}" type="image/${extname(icon).slice(1)}" >` : ''
    
    return {
        name: 'commoners',
        transformIndexHtml(html) {

            const splitByHead = html.split(headStartTag)

            const injection = `
                ${faviconLink}
                <script type="module">

                // Directly import the plugins from the transpiled configuration object
                import COMMONERS_CONFIG from "${assetPath('commoners.config.mjs', outDir, build)}"
                const { plugins } = COMMONERS_CONFIG

                // Set global variable
                const { 
                    services, 
                    send,
                    quit,
                    electron
                } = globalThis.__commoners ?? {} // Grab temporary variables

                globalThis.commoners = JSON.parse(\`${JSON.stringify(globalObject)}\`)

                if (quit) globalThis.commoners.quit = quit
                if (electron) globalThis.commoners.electron = electron

                if (plugins) globalThis.commoners.__plugins = plugins
                if (services) globalThis.commoners.services = services // Replace with sanitized services from Electron if available

                commoners.ready = new Promise(res => {
                    const ogRes = res
                    res = (...args) => {
                        ogRes(...args)
                        delete commoners.__ready
                        if (send) send('commoners:ready')
                    }
                    
                    commoners.__ready = res
                })    

                import("${assetPath('onload.mjs', outDir, build)}")

            </script>\n
            `

            return [splitByHead[0] + injection, splitByHead[1]].join(headStartTag)
        }
    }
}