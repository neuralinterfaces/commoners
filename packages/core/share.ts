import chalk from 'chalk';

import { createServer } from './utils/server.js'
import { createServices, globalTempDir, initialize, resolveConfig } from './index.js';

import { ShareOptions } from './types.js';

import { updateServicesWithLocalIP } from './utils/ip/index.js'
import { getLocalIP } from './utils/ip/cross-platform.js'

import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { buildAssets } from './utils/assets.js';



export default async function (opts: ShareOptions) {

    const services = opts.share?.services
    const sharePort = opts.share?.port
    const port = opts.port

    const root = opts.root

    const resolvedConfig = await resolveConfig(opts, { services, customPort: sharePort === port ? undefined : port })

    const outDir = join(root, globalTempDir)
    initialize(outDir)

    await buildAssets({ ...resolvedConfig, build: { outDir } }, { frontend: false })

    console.log(`\n✊ Sharing ${chalk.bold(chalk.greenBright(resolvedConfig.name))} services ${services ? `(${services})` : ''}\n`)

    const resolvedServices = updateServicesWithLocalIP(resolvedConfig.services)

    const serviceManager = await createServices(resolvedServices)

    if (!sharePort) throw new Error(`No port specified.`)

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
        () => console.log(`Services shared at ${chalk.cyan(`http://${getLocalIP(networkInterfaces)}:${sharePort}`)}\n`)
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