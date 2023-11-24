import chalk from 'chalk';

import { createServer } from './utils/server.js'
import { NAME, createServices, loadConfigFromFile, resolveConfig } from './index.js';

import { ShareOptions } from './types.js';

import { updateServicesWithLocalIP } from './utils/ip/index.js'
import { getLocalIP } from './utils/ip/cross-platform.js'

import { networkInterfaces } from 'node:os';



export default async function (opts: ShareOptions) {

    const services = opts.share?.services
    const sharePort = opts.share?.port
    const port = opts.port

    const resolvedConfig = await resolveConfig(opts, { services, customPort: sharePort === port ? undefined : port })

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
                services: Array.from(new Set(Object.values(serviceManager.active).filter(o => 'src' in o).map(o => o.port)))
            }))
        }
    })

    server.listen(
        sharePort,
        '0.0.0.0', // All IPs
        () => console.log(`Services shared at ${chalk.cyan(`http://${getLocalIP(networkInterfaces)}:${sharePort}`)}\n`)
    );

    return server

}