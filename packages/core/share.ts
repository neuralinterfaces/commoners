import chalk from 'chalk';

import { createServer } from './utils/server.js'
import { createServices, loadConfigFromFile, resolveConfig } from './index.js';

import { localIP } from '../../template/src/main/services/utils/network.js'
import { cliArgs } from './globals.js';

export default async function () {

    const config = await loadConfigFromFile() // Load configuration file only once
    const resolvedConfig = await resolveConfig(config);
    const services = await createServices(resolvedConfig)

    const port = cliArgs.port || process.env.PORT
    if (!port) throw new Error(`No port specified.`)

    // Always pass the available servers
    const server = createServer({
        handler: (res) => {
            res.setHeader('Access-Control-Allow-Origin', '*'); /* @dev First, read about security */
            res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
            res.setHeader('Access-Control-Max-Age', 2592000); // 30 days
            res.setHeader('Content-type', 'text/json');
            res.end(JSON.stringify({
                commoners: process.env,
                services: Array.from(new Set(Object.values(services).filter(o => o.src).map(o => o.port)))
            }))
        }
    })
    

    server.listen(
        port, 
        '0.0.0.0', // All IPs
        () => console.log(`Services shared at ${chalk.cyan(`http://${localIP}:${port}`)}\n`)
    );

}