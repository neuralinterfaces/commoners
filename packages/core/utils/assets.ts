import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { RAW_NAME, rootDir, userPkg } from "../globals.js"
import { dirname, extname, join, parse, relative, sep } from "node:path"

import { isValidURL } from './url.js'
import { copyAsset } from './copy.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { ResolvedService, ResolvedConfig } from "../types.js"
import { loadConfigFromFile, resolveConfig } from "../index.js"

import { spawnProcess } from './processes.js'
import chalk from "chalk"

type AssetInfo = string | {
    input: string,
    output?: string | {
        extension?: 'mjs' | 'cjs'
    }
}  | { text?: string, output: string }

type AssetsCollection = {
    copy: AssetInfo[],
    bundle: AssetInfo[]
}

type AssetServiceOption = boolean | 'electron' | 'electron-rebuild'

const jsExtensions = ['.js', '.mjs', '.cjs', '.ts']

function addServiceAssets(this: AssetsCollection, src?: string) {
    if (jsExtensions.includes(extname(src))) this.bundle.push(src) // Bundle JavaScript files
    else this.copy.push(src) // Copy directories
}


async function buildService({ build, outPath }, name, force = false){

        if (!build) return

        const hasBeenBuilt = existsSync(outPath)
        if (hasBeenBuilt && !force) return

        if (typeof build === 'function') build = build() // Run based on the platform if an object

        if (build) {
            console.log(`\n✊ Building the ${chalk.bold(name)} service\n`)
            await spawnProcess(build)
        }
}

// Derive assets to be transferred to the COMMONERS folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...

export const getAssets = async (config: AssetConfig, services?: AssetServiceOption ) => {
    
    let configPath, resolvedConfig

    if (typeof config === 'string') {
        configPath = config
        config = await loadConfigFromFile(config)
    } 
    
    if (config && typeof config === 'object' && 'path' in config) {
        configPath = config.path
        resolvedConfig = config.resolved
    } 
    
    else resolvedConfig = await resolveConfig(config)

    const configExtensionTargets = ['cjs', 'mjs']

    // Transfer configuration file and related services
    const assets: AssetsCollection = {
        copy: [],
        bundle: configExtensionTargets.map(ext => { return configPath ? {
            input: configPath.split(sep).slice(-1)[0],
            output: { extension: ext }
        } : { text: 'export default {}', output: `commoners.config.${ext}` } })
    }

    // Bundle onload script for the browser
    assets.bundle.push({
        input: join(rootDir, 'templates', 'onload.ts'),
        output: 'onload.mjs'
    })

    if (existsSync('.env')) assets.copy.push('.env') // Copy .env file if it exists
    
    // Handle Provided Services (copy / build)
    if (services !== false) {

        const resolvedServices = resolvedConfig.services as ResolvedConfig['services']
       
        for (const [name, o] of Object.entries(resolvedServices)) {

            const resolved = o.base ?? o.src

            if (!resolved) continue // Do not copy if file doesn't exist

            const isURL = isValidURL(resolved)

            const hasBuild = o.build

            const isElectron = services === 'electron' || services === 'electron-rebuild' 
            if (hasBuild && isURL && isElectron) continue // Do not copy if file is a url (Electron-only)

            const forceRebuild = services === 'electron-rebuild' || services === true
            
            if (!isURL) addServiceAssets.call(assets, resolved)

            await buildService({ build: o.build, outPath: resolved }, name, forceRebuild)
        }
    }

    // Copy Icons
    if (resolvedConfig.icon) {

        const icons = (typeof resolvedConfig.icon === 'string') ? [resolvedConfig.icon] : Object.values(resolvedConfig.icon)

        assets.copy.push(...icons)
    }

    // Bundle Splash Page
    if (resolvedConfig.electron.splash) assets.bundle.push(resolvedConfig.electron.splash)

    return assets
}


export const clear = (outDir: string) => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }) // Clear output directory (similar to Vite)
}


type AssetConfig = { path: string, resolved: ResolvedConfig } | ResolvedConfig | string
export const buildAssets = async ({
    config, 
    outDir,
    services,
}: {
    config: AssetConfig,
    outDir: string,
    services?: AssetServiceOption
}) => {

    mkdirSync(outDir, { recursive: true }) // Ensure base and asset output directory exists

    writeFileSync(join(outDir, 'package.json'), JSON.stringify({ name: `commoners-${RAW_NAME}`, version: userPkg.version }, null, 2)) // Write package.json to ensure these files are treated as commonjs

    const assets = await getAssets(config, services)

    // Create an assets folder with copied assets (ESM)
    await Promise.all(assets.bundle.map(async info => {

        const hasMetadata = typeof info !== 'string'
        const input = hasMetadata ? info.input : info
        const output = hasMetadata ? info.output : null
        const explicitOutput = typeof output === 'string' ? output : null
        const hasExplicitInput = typeof input === 'string'

        if (hasMetadata && 'text' in info && hasMetadata && explicitOutput) writeFileSync(join(outDir, explicitOutput), info.text)
        else if (hasExplicitInput) {
            const ext = extname(input)
            const outPath = explicitOutput ? join(outDir, explicitOutput) : join(outDir, input)

            const root = dirname(input)


            // Bundle HTML Files using Vite
            if (ext === '.html') await vite.build({
                logLevel: 'silent',
                base: "./",
                root,
                build: {
                    outDir: relative(root, dirname(outPath)),
                    rollupOptions: { input: input }
                },
            })

            // Build JavaScript Files using ESBuild
            else {
                
                const resolvedExtension = explicitOutput ? extname(explicitOutput).slice(1) : (hasMetadata ? output?.extension : '') || 'js'
                const outfile = join(dirname(outPath), `${parse(input).name}.${resolvedExtension}`)

                const baseConfig: esbuild.BuildOptions = {
                    entryPoints: [input],
                    bundle: true,
                    logLevel: 'silent',
                    outfile,
                }

                // Force a build format if the proper extension is specified
                const format = resolvedExtension === 'mjs' ? 'esm' : resolvedExtension === 'cjs' ? 'cjs' : undefined


                const buildForNode = () => buildForBrowser({ platform: 'node', external: [ "*.node" ] })
                
                const buildForBrowser = (opts = {}) => esbuild.build({ ...baseConfig, format, ...opts})
                
                if (resolvedExtension === 'cjs') buildForNode()
                else buildForBrowser().catch(buildForNode) // Externalize all node dependencies
            }
        } 
        
        else console.warn('Asset not transferred to the build:', input)
    }))

    // Copy static assets
    assets.copy.map(info => copyAsset(info, { outDir }))
}