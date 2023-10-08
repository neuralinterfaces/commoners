import chalk from 'chalk';

import { createServer } from './utils/server.js'
import { createServices, loadConfigFromFile, resolveConfig } from './index.js';

export default async function () {

        const config = await loadConfigFromFile() // Load configuration file only once
        const resolvedConfig = await resolveConfig(config);
        const services = await createServices(resolvedConfig)

        const host = 'localhost'
        const port = 3768

        // Always pass the available servers
        const server = createServer({ 
            handler: (res) => {
                res.setHeader('Content-type', 'text/json' );
                res.end(JSON.stringify({
                    servers: Array.from(new Set(Object.values(services).map(o => o.url)))
                }))
            }
        })

        server.listen(port, host, () => {
            const url = `http://${host}:${port}`
            console.log(`Services shared at ${chalk.cyan(url)}`);
        });


        
    }