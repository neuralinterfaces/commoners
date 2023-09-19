import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { COMMAND, MODE, NAME, PLATFORM, TARGET, assetOutDir, configPath, outDir, scopedOutDir, userPkg } from "./globals.js"
import { dirname, extname, join, parse, relative, sep } from "node:path"

import { isValidURL } from './utils/url.js'
import { copyAsset } from './utils/copy.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { ResolvedConfig, UserService, UserConfig } from "./types.js"
import { loadConfigFromFile, resolveConfig } from "./index.js"

type AssetInfo = string | {
    input: string,
    output?: {
        extension?: 'mjs' | 'cjs'
    }
}

type AssetsCollection = {
    copy: AssetInfo[],
    bundle: AssetInfo[]
}

const jsExtensions = ['.js', '.ts']

function addServiceAssets(this: AssetsCollection, config: UserService) {
    const filepath = typeof config === 'string' ? config : (config as any).src

    if (!filepath) return // Do not copy if file doesn't exist
    if (isValidURL(filepath)) return // Do not copy if file is a url

    if (jsExtensions.includes(extname(filepath))) this.bundle.push(filepath)
    else this.copy.push(filepath)
}

// Derive assets to be transferred to the COMMONERS folder
export const getAssets = async (config?: UserConfig) => {

    const resolvedConfig = await resolveConfig(config ||  await loadConfigFromFile())

    // Transfer configuration file and related services
    const assets: AssetsCollection = {
        copy: [],
        bundle: configPath ? [{
            input: configPath.split(sep).slice(-1)[0],
            output: {
                extension: 'mjs'
            }
        }] : []
    }
    
    // Copy Services Only in Development / Electron Builds
    if (COMMAND !== 'build' || TARGET === 'desktop') Object.values(resolvedConfig.services).forEach(o => addServiceAssets.call(assets, o))

    // Copy Icons
    if (resolvedConfig.icon) assets.copy.push(...(typeof resolvedConfig.icon === 'string') ? [resolvedConfig.icon] : Object.values(resolvedConfig.icon))

    // Bundle Splash Page
    if (resolvedConfig.electron.splash) assets.bundle.push(resolvedConfig.electron.splash)

    return assets
}


export const clearOutputDirectory = () => {
    if (existsSync(scopedOutDir)) rmSync(scopedOutDir, { recursive: true, force: true }) // Clear output directory
}

export const populateOutputDirectory = async ( config: ResolvedConfig ) => {
    mkdirSync(scopedOutDir, { recursive: true }) // Ensure base output directory exists

    writeFileSync(join(scopedOutDir, 'package.json'), JSON.stringify({ name: `commoners-${NAME}`, version: userPkg.version }, null, 2)) // Write package.json to ensure these files are treated as commonjs

    const assets = await getAssets(config)

    // Create an assets folder with copied assets (ESM)
    await Promise.all(assets.bundle.map(async info => {

        const hasMetadata = typeof info !== 'string'
        const input = hasMetadata ? info.input : info

        const ext = extname(input)
        const outPath = join(assetOutDir, input)
        const outDir = dirname(outPath)
        const root = dirname(input)

        // Bundle HTML Files using Vite
        if (ext === '.html') await vite.build({
            logLevel: 'silent',
            base: "./",
            root,
            build: {
                outDir: relative(root, outDir),
                rollupOptions: { input: input }
            },
        })

        // Build JavaScript Files using ESBuild
        else {
            const resolvedExtension = (hasMetadata ? info.output?.extension : '') || 'js'
            const outfile = join(outDir, `${parse(input).name}.${resolvedExtension}`)

            const baseConfig: esbuild.BuildOptions = {
                entryPoints: [input],
                bundle: true,
                logLevel: 'silent',
                outfile,
            }

            if (resolvedExtension === 'mjs') await esbuild.build({ ...baseConfig, format: 'esm' })
            else if (resolvedExtension === 'cjs') await esbuild.build({ ...baseConfig, format: 'cjs' })
            else return await esbuild.build({ ...baseConfig,  format: 'esm' })
                .catch(() => esbuild.build({
                    ...baseConfig,
                    external: ['*.node'],
                    platform: 'node'
                }))
        }
    }))

    // Copy static assets
    assets.copy.map(src => copyAsset(src))

    // Create yml file for dist
    writeFileSync(join(outDir, '_config.yml'), `include: ['.commoners']`)
}