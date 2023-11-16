
import { normalize, extname } from 'node:path'
import { getIcon } from '../../utils/index.js'
import { isDesktop, isMobile, NAME, VERSION } from '../../globals.js'

const assetPath = (path, outDir, isBuild) => `./${normalize(`${isBuild ? '' : `${outDir}/`}/${path}`)}`

export default ({ 
    config, 
    build, 
    outDir,
    target
}) => {

    const icon = getIcon(config.icon)

    const propsToInclude = [ 'url' ]
    const services = {} 
    Object.entries(config.services).forEach(([id, sInfo]) => {
      const gInfo = services[id] = {}
      propsToInclude.forEach(prop => gInfo[prop] = sInfo[prop])
    })

    const isDesktopTarget = isDesktop(target)
    const isMobileTarget = isMobile(target)

    const globalObject = {
        name: NAME,
        version: VERSION,
        services,
        target: isDesktopTarget ? 'desktop' : isMobileTarget ? 'mobile' : 'web'
    }

    const faviconLink = icon ? `<link rel="shortcut icon" href="${assetPath(icon, outDir, build)}" type="image/${extname(icon).slice(1)}" >` : ''

    return {
        name: 'commoners',
        transformIndexHtml(html) {
            return `
            ${faviconLink}
            <script type="module">

            // Directly import the plugins from the transpiled configuration object
            import COMMONERS_CONFIG from "${assetPath('commoners.config.mjs', outDir, build)}"
            const { plugins } = COMMONERS_CONFIG

            // Set global variable
            const { services, ipcRenderer } = globalThis.__commoners ?? {} // Grab temporary variables

            globalThis.commoners = JSON.parse(\`${JSON.stringify(globalObject)}\`)

            if (plugins) globalThis.commoners.__plugins = plugins
            if (services) globalThis.commoners.services = services // Replace with sanitized services from Electron if available

            commoners.ready = new Promise(res => {
                const ogRes = res
                res = (...args) => {
                    ogRes(...args)
                    delete commoners.__ready
                    if (ipcRenderer) ipcRenderer.send('commoners:ready')
                }
                
                commoners.__ready = res
            })    

            import("${assetPath('onload.mjs', outDir, build)}")

            </script>
            \n${html}`
        }
    }
}