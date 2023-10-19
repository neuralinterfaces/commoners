
import { normalize, extname } from 'node:path'
import { getIcon } from '../../utils/index'

const assetPath = (path, isBuild) => `./${normalize(`${isBuild ? '' : 'dist/'}.commoners/assets/${path}`)}`

export default ({ 
    config, 
    build, 
    TARGET, 
    MODE
}) => {

    const icon = getIcon(config.icon)

    const propsToInclude = [ 'url' ]
    const services = {} 
    Object.entries(config.services).forEach(([id, sInfo]) => {
      const gInfo = services[id] = {}
      propsToInclude.forEach(prop => gInfo[prop] = sInfo[prop])
    })

    const globalObject = {
        services,
        TARGET,
        MODE
    }

    const faviconLink = icon ? `<link rel="shortcut icon" href="${assetPath(icon, build)}" type="image/${extname(icon).slice(1)}" >` : ''

    return {
        name: 'commoners',
        transformIndexHtml(html) {
            return `
            ${faviconLink}
            <script type="module">

            // Directly import the plugins from the transpiled configuration object
            import COMMONERS_CONFIG from "${assetPath('commoners.config.mjs', build)}"
            const { plugins } = COMMONERS_CONFIG

            // Set global variable
            const { services, ipcRenderer } = globalThis.__COMMONERS ?? {} // Grab temporary variables

            globalThis.COMMONERS = JSON.parse(\`${JSON.stringify(globalObject)}\`)

            if (plugins) globalThis.COMMONERS.__plugins = plugins
            if (services) globalThis.COMMONERS.services = services // Replace with sanitized services from Electron if available

            COMMONERS.ready = new Promise(res => {
                const ogRes = res
                res = (...args) => {
                    ogRes(...args)
                    delete COMMONERS.__ready
                    if (ipcRenderer) ipcRenderer.send('COMMONERS:ready')
                }
                
                COMMONERS.__ready = res
            })    

            import("${assetPath('onload.mjs', build)}")

            </script>
            \n${html}`
        },
    }
}