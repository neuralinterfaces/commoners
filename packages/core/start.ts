import { StartOptions } from "./types.js";

import { build, configureForDesktop, createServices, loadConfigFromFile, resolveConfig } from './index.js'
import { updateServicesWithLocalIP } from "./utils/ip/index.js";
import { buildAssets } from "./utils/assets.js";
import { createServer } from "./vite/index.js";
import { NAME, ensureTargetConsistent, globalTempDir, isDesktop, isMobile } from "./globals.js";
import chalk from "chalk";
import { existsSync } from "node:fs";


export default async function ( configPath: string, options: StartOptions ) {

        const { port } = options

        const target = ensureTargetConsistent(options.target)

        console.log(`\n✊ Starting ${chalk.greenBright(NAME)} for ${target}\n`)

        const config = await loadConfigFromFile(configPath) // Load configuration file only once

        const resolvedConfig = await resolveConfig(config, { customPort: port });


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
        if (isMobileTarget) await build(configPath, options, resolvedServices)

        // Manually clear and build the output assets
        else {

            await buildAssets({
                config: configPath, // NOTE: Configuration path is required for proper plugin transfer...
                outDir: globalTempDir,
                services: false
            })

        }

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