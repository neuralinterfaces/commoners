import chalk from 'chalk';

import { createServer } from './utils/server.js'
import { NAME, createServices, loadConfigFromFile, resolveConfig } from './index.js';

import { ResolvedConfig, UserConfig, ShareOptions, PortType } from './types.js';

import { updateServicesWithLocalIP } from './utils/ip/index.js'
import { getLocalIP } from './utils/ip/cross-platform.js'

import { networkInterfaces } from 'node:os';


export default async function (
    config: UserConfig | ResolvedConfig | string,
    sharePort: PortType, 
    {
        services,
        port,
    }: ShareOptions = {}
) {

    console.log(`\n✊ Sharing ${chalk.greenBright(NAME)} services ${services ? `(${services})` : ''}\n`)

    if (typeof config === 'string') config = await loadConfigFromFile(config)
    const resolvedConfig = await resolveConfig(config, { services, customPort: sharePort === port ? undefined : port })

    const resolvedServices = updateServicesWithLocalIP(resolvedConfig.services)

    const activeServices = await createServices(resolvedServices)

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
                services: Array.from(new Set(Object.values(activeServices).filter(o => 'src' in o).map(o => o.port)))
            }))
        }
    })

    server.listen(
        sharePort,
        '0.0.0.0', // All IPs
        () => console.log(`Services shared at ${chalk.cyan(`http://${getLocalIP(networkInterfaces)}:${sharePort}`)}\n`)
    );

}