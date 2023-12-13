import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { rootDir } from "../globals.js"
import { dirname, extname, join, parse, relative, isAbsolute, resolve } from "node:path"

import { isValidURL } from './url.js'
import { copyAsset } from './copy.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { ResolvedConfig, ResolvedService, UserConfig } from "../types.js"
import { resolveConfig, resolveConfigPath } from "../index.js"

import pkg from 'pkg'

import { spawnProcess } from './processes.js'
import chalk from "chalk"

type AssetInfo = string | { text: string, output: string } | {
    input: string,
    output?: string | {
        extension: 'mjs' | 'cjs', // JavaScript
    }
}

type AssetsCollection = {
    copy: AssetInfo[],
    bundle: AssetInfo[]
}

type AssetServiceOption = boolean | 'electron' | 'electron-rebuild'

const jsExtensions = ['.js', '.mjs', '.cjs', '.ts']

// Intelligently build service only if it hasn't been built yet (unless forced)
const mustBuild = ({ name, out, force }, log = false) => {
    const hasBeenBuilt = existsSync(out)
    if (hasBeenBuilt && !force) return false
    if (log) console.log(`\n👊 ${hasBeenBuilt ? 'Updating' : 'Creating'} the ${chalk.bold(chalk.greenBright(name))} service\n`)
    return true
}


type PackageInfo = {
    name: string,
    force?: boolean,
    src: string,
    out: string
}

export const packageFile = async (info: PackageInfo, log = false) => {

    const { 
        name, 
        src, 
        out, 
        force 
    } = info

    const tempOut = join(out, `${name}.js`)

    const shouldBuild = mustBuild({
        out,
        force,
        name
    }, log)

    if (!shouldBuild) return out

    await esbuild.build({ 
        entryPoints: [ src ],
        bundle: true,
        logLevel: 'silent',
        outfile: tempOut,
        format: 'cjs', 
        platform: 'node', 
        external: [ "*.node" ]
    })

    await pkg.exec([tempOut, '--target', 'node16', '--out-path', out]);

    rmSync(tempOut, { force: true })

    return out
}


async function buildService(
    { 
        build,
        out,
        __src,
    }: { 
        __src: string,
        out: string,
        build: ResolvedService['build'] 
    }, 
    name, 
    force = false
){

        if (!build) return null
        
        // Check Auto Builds
        if (build && typeof build === 'object') {
            return packageFile({
                name,
                force,
                ...(build as any)
            }, true)
        }
        
        // Check Custom Builds
        else {

            const shouldBuild = mustBuild({
                name,
                out,
                force
            })

            if (!shouldBuild) return out
        }

        // Dynamic Configuration
        if (typeof build === 'function') {
            const ctx = {
                package: packageFile
            }

            build = await build.call(ctx, {
                name,
                src: __src,
                out,
                force
            })
        }

        if (typeof build === 'string') {
            try {
                resolve(build)
                return out
            } catch {
                await spawnProcess(build)
                return out
            }
        }
}

// Derive assets to be transferred to the Commoners folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...

export const getAssets = async (config: UserConfig, mode?: AssetServiceOption ) => {
    
    const resolvedConfig = await resolveConfig(config)

    const { root, target } = resolvedConfig

    const configPath = resolveConfigPath(root)

    const configExtensionTargets: ['cjs', 'mjs'] = ['cjs', 'mjs']

    const isElectronTarget = target === 'electron'

    // Transfer configuration file and related services
    const assets: AssetsCollection = {
        copy: [],
        bundle: configExtensionTargets.map(ext => { return configPath ? {
            input: configPath,
            output: `commoners.config.${ext}`
        } : { text: ext === 'cjs' ? "module.exports = {default: {}}" : "export default {}", output: `commoners.config.${ext}` } })
    }

    // Bundle onload script for the browser
    assets.bundle.push({
        input: join(rootDir, 'templates', 'onload.ts'),
        output: 'onload.mjs'
    })

    if (isElectronTarget) {

        // Copy .env file if it exists
        const envPath = join(root, '.env')
        if (existsSync(envPath)) assets.copy.push(envPath)

        // Bundle Splash Page
        const splashPath = resolvedConfig.electron.splash
        if (splashPath) {
            assets.bundle.push({
                input: join(root, splashPath),
                output: splashPath
            })
        }
    }

    
    // Handle Provided Services (copy / build)
    if (mode !== false) {

        const resolvedServices = resolvedConfig.services as ResolvedConfig['services']
       
        for (const [name, resolvedService] of Object.entries(resolvedServices)) {

            // @ts-ignore
            const { src, base } = resolvedService

            const toCopy = base ?? src

            if (!toCopy) continue // Cannot copy if no source has been specified

            const isURL = isValidURL(src)

            const hasBuild = resolvedService.build


            if (hasBuild && isURL && isElectronTarget) continue // Do not copy if file is a url (Electron-only)

            const forceRebuild = mode === 'electron-rebuild' || mode === true
            
            if (!isURL) {

                const { __src, build } = resolvedService as any

                const output = await buildService({ __src, build, out: join(root, toCopy) }, name, forceRebuild)
                        
                if (existsSync(output)){
                    if (jsExtensions.includes(extname(output))) assets.bundle.push(output) // Bundle JavaScript files
                    else assets.copy.push(output) // Copy directories
                } else console.error(`Could not resolve ${chalk.red(name)} source file: ${output}`)
            }
        }
    }

    // Copy Icons
    if (resolvedConfig.icon) {

        const icons = (typeof resolvedConfig.icon === 'string') ? [resolvedConfig.icon] : Object.values(resolvedConfig.icon)

        assets.copy.push(...icons as string[])
    }

    return assets
}


export const clear = (outDir: string) => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }) // Clear output directory (similar to Vite)
}

export const buildAssets = async (config: ResolvedConfig, mode?: AssetServiceOption) => {

    const { outDir } = config.build

    mkdirSync(outDir, { recursive: true }) // Ensure base and asset output directory exists

    const randomId = Math.random().toString(36).substring(7)
    writeFileSync(join(outDir, 'package.json'), JSON.stringify({ name: `commoners-build-${randomId}`, version: config.version }, null, 2)) // Write package.json to ensure these files are treated as commonjs

    const assets = await getAssets(config, mode)

    const outputs = []

    const { root } = config

    // Create an assets folder with copied assets (ESM)
    await Promise.all(assets.bundle.map(async info => {

        const output = typeof info === 'string' ? null : info.output

        // Just copy text to the output file
        if (typeof info !== 'string' && 'text' in info) {
            if (typeof output === 'string') return writeFileSync(join(outDir, output), info.text)
            else return // Nowhere to write the text
        }

        // Transform an input file in some way
        const input = typeof info === 'string' ? info : info.input
        const hasExplicitInput = typeof input === 'string'

        if (hasExplicitInput) {

            const ext = extname(input)

            // NOTE: Output is always taken literally
            const outPath = typeof output === 'string' ? join(outDir, output) : (() => {
                const relPath = isAbsolute(input) ? relative(root, input) : input
                return join(outDir, relPath)
            })()

            const fileRoot =  dirname(input)
            

            // Bundle HTML Files using Vite
            if (ext === '.html') {
                await vite.build({
                    logLevel: 'silent',
                    base: "./",
                    root: fileRoot,
                    build: {
                        emptyOutDir: false, // Ensure assets already built are maintained
                        outDir: relative(fileRoot, dirname(outPath)),
                        rollupOptions: { input }
                    },
                })

            }

            // Build JavaScript Files using ESBuild
            else {
                
                const resolvedExtension = typeof output === 'string' ? extname(output).slice(1) : (output?.extension ?? ext.slice(1))
                const outfile = join(dirname(outPath), `${parse(input).name}.${resolvedExtension}`)

                const baseConfig: esbuild.BuildOptions = {
                    entryPoints: [ input ],
                    bundle: true,
                    logLevel: 'silent',
                    outfile
                }

                // Force a build format if the proper extension is specified
                const format = resolvedExtension === 'mjs' ? 'esm' : resolvedExtension === 'cjs' ? 'cjs' : undefined

                const buildForNode = () => buildForBrowser({ 
                    platform: 'node', 
                    external: [ "*.node" ] 
                })
                
                const buildForBrowser = (opts = {}) => esbuild.build({ ...baseConfig, format, ...opts})
                
                if (resolvedExtension === 'cjs') await buildForNode()
                else await buildForBrowser().catch(buildForNode) // Externalize all node dependencies

                outputs.push(outfile)
            }
        } 
    }))

    // Copy static assets
    assets.copy.map(info => outputs.push(copyAsset(info, { outDir, root })))

    return outputs
}