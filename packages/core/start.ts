import { UserConfig } from "./types.js";

import { build, configureForDesktop, createServices, resolveConfig } from './index.js'
import { updateServicesWithLocalIP } from "./utils/ip/index.js";
import { buildAssets } from "./utils/assets.js";
import { createServer } from "./vite/index.js";
import { cleanup, globalTempDir, initialize, isDesktop, isMobile } from "./globals.js";
import chalk from "chalk";

import { join } from "node:path";

export default async function ( opts: UserConfig = {} ) {

        const { port } = opts

        const resolvedConfig = await resolveConfig(opts, { customPort: port });
        
        const { target, name, root } = resolvedConfig

        const isDesktopTarget = isDesktop(target)
        const isMobileTarget = isMobile(target)

        console.log(`\n✊ Starting ${chalk.bold(chalk.greenBright(name))} for ${target}\n`)

        // Create URLs that will be shared with the frontend
        if (isMobileTarget) resolvedConfig.services = updateServicesWithLocalIP(resolvedConfig.services)

        const { services: resolvedServices } = resolvedConfig
        
        const createAllServices = () => {
            console.log(`\n👊 Starting ${chalk.bold('Services')}\n`)
            return createServices(resolvedServices, { root }) // Run services in parallel
        }


        const outDir = join(root, globalTempDir)

        initialize(outDir)


        // Build for mobile before moving forward
        if (isMobileTarget) await build(resolvedConfig, {
            services: resolvedServices
        })

        // Manually clear and build the output assets
        else {
            const copy = { ...resolvedConfig }
            copy.build = { ...copy.build, outDir }
            await buildAssets(copy, false)
        }


        const activeInstances: {
            frontend?: Awaited<ReturnType<typeof createServer>>,
            services?: Awaited<ReturnType<typeof createAllServices>>
        } = {}

        const closeFunction = (o) => {
            cleanup(outDir) // Ensure the temporary directory is cleared
            if (o.frontend) activeInstances.frontend?.close()
            if (o.services) activeInstances.services?.close()
        }

        const manager: {
            url?: string,
            close: typeof closeFunction
        } = {
            close: closeFunction
        }

        // Configure the desktop instance
        if (isDesktopTarget) await configureForDesktop(outDir) // NOTE: Do not correct for root here

        // Create all services
        else activeInstances.services = await createAllServices()

        // Serve the frontend (if not mobile)
        if (!isMobileTarget) {
            
            const frontend = activeInstances.frontend = await createServer(resolvedConfig, { 
                printUrls: !isDesktopTarget, 
                outDir,
                target
            })

            manager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server
        
        }

        return manager
}