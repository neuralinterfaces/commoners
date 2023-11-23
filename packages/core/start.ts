import { UserConfig } from "./types.js";

import { build, configureForDesktop, createServices, loadConfigFromFile, resolveConfig, resolveConfigPath } from './index.js'
import { updateServicesWithLocalIP } from "./utils/ip/index.js";
import { buildAssets } from "./utils/assets.js";
import { createServer } from "./vite/index.js";
import { NAME, ensureTargetConsistent, globalTempDir, initialize, isDesktop, isMobile } from "./globals.js";
import chalk from "chalk";

export default async function ( opts: UserConfig ) {

        initialize()

        const { port } = opts

        const target = ensureTargetConsistent(opts.target)

        const resolvedConfig = await resolveConfig(opts, { customPort: port });

        const { name } = resolvedConfig
        console.log(`\n✊ Starting ${chalk.greenBright(name)} for ${target}\n`)


        const isMobileTarget = isMobile(target)

        // Create URLs that will be shared with the frontend
        if (isMobileTarget) resolvedConfig.services = updateServicesWithLocalIP(resolvedConfig.services)

        const { services: resolvedServices } = resolvedConfig
        
        const createAllServices = () => {
            console.log(`\n👊 Creating ${chalk.bold('Services')}\n`)
            createServices(resolvedServices) // Run services in parallel
        }

        const isDesktopTarget = isDesktop(target)

        // Build for mobile before moving forward
        if (isMobileTarget) await build(resolvedConfig, resolvedServices)

        // Manually clear and build the output assets
        else await buildAssets({...resolvedConfig, outDir: globalTempDir}, false)

        // Configure the desktop instance
        if (isDesktopTarget) await configureForDesktop(globalTempDir) // Configure the desktop instance

        // Create all services
        else await createAllServices()

        // Serve the frontend (if not mobile)
        if (!isMobileTarget) {
            
            await createServer(resolvedConfig, { 
                printUrls: !isDesktopTarget, 
                outDir: globalTempDir,
                target
            })
        }
}