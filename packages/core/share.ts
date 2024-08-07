// Built-In Modules
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

// Internal Imports
import { chalk, createServices, globalTempDir, initialize, resolveConfig } from './index.js';
import { ShareOptions } from './types.js';

// Internal Utilities
import { buildAssets } from './utils/assets.js';
import { printHeader, printServiceMessage } from './utils/formatting.js';
import { updateServicesWithLocalIP } from './utils/ip/index.js'
import { getLocalIP } from './utils/ip/cross-platform.js'
import { createServer } from './utils/server.js'

export default async function (opts: ShareOptions) {

    const _chalk = await chalk

    const services = opts.share?.services
    const sharePort = opts.share?.port
    const port = opts.port

    const root = opts.root

    const resolvedConfig = await resolveConfig(opts, { services, customPort: sharePort === port ? undefined : port })

    const outDir = join(root, globalTempDir)
    await initialize(outDir)

    await buildAssets({ ...resolvedConfig, build: { outDir } }, { assets: false })

    await printHeader(`${resolvedConfig.name} — Sharing Services ${services ? `(${services})` : ''}`)

    const resolvedServices = updateServicesWithLocalIP(resolvedConfig.services)

    const serviceManager = await createServices(resolvedServices)

    if (!sharePort) {
        console.log(`${_chalk.grey('No port specified for sharing services')}\n`)
        return
    }

    // Always pass the available servers
    const server = createServer({
        handler: (res) => {
            res.setHeader('Access-Control-Allow-Origin', '*'); /* @dev First, read about security */
            res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
            res.setHeader('Access-Control-Max-Age', 2592000); // 30 days
            res.setHeader('Content-type', 'text/json');
            res.end(JSON.stringify({
                commoners: process.env,
                services: Object.entries(serviceManager.active).filter(([_, o]) => 'src' in o).reduce((acc, [id, o]) =>{
                    acc[id] = o.port
                    return acc
                }, {})
            }))
        }
    })

    server.listen(
        sharePort,
        '0.0.0.0', // All IPs
        async () => {
            await printServiceMessage('commoners-share-hub', _chalk.cyan(`http://${getLocalIP(networkInterfaces)}:${sharePort}`))
            for (const [id, service] of Object.entries(serviceManager.active)) await printServiceMessage(id, _chalk.cyan(`http://${service.host}:${service.port}`))
        }
    );

    return {
        services: serviceManager.active,
        port: sharePort,
        close: () => {
            server.close()
            serviceManager.close()
        }
    }

}