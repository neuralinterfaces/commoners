// Built-In Modules
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, extname, join, relative, isAbsolute, resolve, normalize, sep, posix, basename } from "node:path"
import { pathToFileURL } from "node:url"



// Internal Imports
import { resolveConfigPath } from "../index.js"
import { copyAsset, copyAssetOld } from './copy.js'
import { encodePath } from "./encode.js"
import { chalk, isDesktop, rootDir, vite } from "../globals.js"
import { spawnProcess } from './processes.js'
import { ResolvedConfig, ResolvedService, PackageBuildInfo } from "../types.js"
import { withExternalBuiltins } from "../vite/plugins/electron/inbuilt.js"
import { printSubtle } from "./formatting.js"

const CONFIG_EXTENSION_TARGETS = [
    '.cjs',
    '.mjs' // Fails for Node.js dependencies (e.g. @commoners/solidarity)
]


type ESBuildBuildOptions = import('esbuild').BuildOptions

type AssetMetadata = {
    extraResource?: boolean,
    sign?: boolean
}

type BuildInfo = {
    src: string,
    out: string,
}

type BuildOutput = string | undefined
type BuildFunction = (info: BuildInfo) => Promise<BuildOutput> | BuildOutput

type CoreAssetInfo = string | {
    input: string,
    output?: string
    force?: boolean,
    compile?: BuildFunction // Function to compile the asset
} & AssetMetadata

type AssetInfo = CoreAssetInfo | { text: string, output: string }

type AssetOutput = { file: string } & AssetMetadata

type AssetsCollection = {
    copy: CoreAssetInfo[],
    bundle: AssetInfo[]
}

const getAbsolutePath = (root: string, path: string) => isAbsolute(path) ? path : join(root, path)

// Intelligently build service only if it hasn't been built yet (unless forced)
const mustBuild = ({ outDir, force }) => {
    const hasBeenBuilt = existsSync(outDir)
    if (hasBeenBuilt && !force) return false
    return true
}

const getBuildDir = (outDir: string) => join(resolve(outDir), 'assets')

const sharedWithElectron = ['commoners.config.cjs']

export const getAssetBuildPath = (assetPath: string, outDir: string, isSharedWithElectron?: boolean) => {
    const inputToCompare = assetPath.replaceAll(sep, posix.sep)
    if (isSharedWithElectron === undefined) isSharedWithElectron = sharedWithElectron.includes(inputToCompare)
    if (isSharedWithElectron) return join(getBuildDir(outDir), assetPath) // Ensure consistently resolved by Electron
    const buildDir = getBuildDir(outDir)
    const encoded = encodePath(assetPath)
    return join(buildDir, encoded)
}

export const getAssetLinkPath = (
    path,
    outDir,
    root = outDir
) => {


    // Get the absolute path of the asset
    const absOutPath = getAssetBuildPath(path, outDir)
    const resolvedRoot = resolve(root)

    // Get the relative path of the asset
    let outPath = normalize(relative(resolvedRoot, absOutPath))
    if (!(outPath[0] === sep)) outPath = sep + outPath
    if (!(outPath[0] === '.')) outPath = '.' + outPath
    const result = outPath.replaceAll(sep, posix.sep)
    return result
}

export const packageFile = async (info: PackageBuildInfo) => {

    const _chalk = await chalk

    const {
        name,
        src,
        out,
        force
    } = info

    const outDir = dirname(out)
    const outName = basename(out, extname(out))

    const tempOut = join(outDir, outName) + '.js'

    const shouldBuild = mustBuild({ outDir: outDir, force })

    if (!shouldBuild) {
        printSubtle(`Skipping ${_chalk.bold(name)} build`)
        return outDir
    }

    const esbuild = await import('esbuild')
    const pkg = await import('pkg')

    await esbuild.build({
        entryPoints: [src],
        bundle: true,
        logLevel: 'silent',
        outfile: tempOut,
        format: 'cjs',
        platform: 'node',
        external: ["*.node"]
    })

    await pkg.exec([
        tempOut,
        '--target',
        'node16',
        '--out-path',
        outDir
    ]);

    rmSync(tempOut, { force: true })

    return outDir
}


async function buildService(
    {
        build,
        out,
        src,
        root
    }: {
        src: string,
        out: string,
        build: ResolvedService['build'],
        root: ResolvedConfig['root']
    },
    name,
    force = false
) {

    out = resolve(out)
    const buildInfo = { name, src, out, force }

    // Dynamic Configuration
    if (typeof build === 'function') {
        const ctx = { package: packageFile }
        build = await build.call(ctx, buildInfo)
        if (!build) return // No file emitted
    }

    // Handle string build commands
    if (typeof build === 'string') {

        // Output path
        if (existsSync(build)) return build

        // Terminal Command
        await spawnProcess(build, [], { cwd: root })

    }

    // Auto Build Configuration
    else return await packageFile(buildInfo)

}

// Derive assets to be transferred to the Commoners folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...
export const getAssets = async (resolvedConfig: ResolvedConfig, toBuild: AssetsToBuild = {}, dev = false) => {

    const { root, target } = resolvedConfig
    const { outDir } = resolvedConfig.build

    const configPath = resolveConfigPath(root)

    // Transfer configuration file and related services
    const assets: AssetsCollection = {
        copy: [],
        bundle: []
    }

    if (toBuild.assets !== false) {

        // Create Config
        assets.bundle.push(...CONFIG_EXTENSION_TARGETS.map(ext => {
            const output = `commoners.config${ext}`
            return configPath ? { input: configPath, output } : { text: ext === '.cjs' ? "module.exports = {default: {}}" : "export default {}", output }
        }))

        // Bundle onload script for the browser
        assets.bundle.push({
            input: join(rootDir, 'assets', 'onload.ts'),
            output: 'onload.mjs'
        })


        // Copy Icons
        if (resolvedConfig.icon) {
            const icons = (typeof resolvedConfig.icon === 'string') ? [resolvedConfig.icon] : Object.values(resolvedConfig.icon)
            assets.copy.push(...icons.map(icon => getAbsolutePath(root, icon)) as string[])
        }


    }

    // Handle Provided Plugins
    for (const [id, plugin] of Object.entries(resolvedConfig.plugins)) {

        const pluginAssets = { ...(plugin.assets ?? {}) }

        // Only bundle assets in production mode
        if (!dev) Object.entries(pluginAssets).map(([key, fileInfo]) => {

            const fileInfoDictionary = typeof fileInfo === 'string' ? { src: fileInfo } : fileInfo
            const { src } = fileInfoDictionary

            // Skip HTML files for bundling or copying
            // Handle in the main Vite build process instead
            if (extname(src) === '.html') {
                pluginAssets[key] = src
                return 
            }
            
            const absPath = getAbsolutePath(root, src)

            const filename = basename(src)
            const assetPath = join('plugins', id, key, filename)
            const outPath = getAssetBuildPath(assetPath, outDir, true) // Always resolve in a way that's consistent with Electron

            assets.bundle.push({
                input: absPath,
                output: outPath, // Uses Vite to handle the asset
                force: true // Ensure strict output location
            })

            pluginAssets[key] = outPath
        })

        if (plugin.assets) plugin.assets = pluginAssets
    }

    // Handle Provided Services
    const resolvedServices = resolvedConfig.services as ResolvedConfig['services']

    for (const [name, resolvedService] of Object.entries(resolvedServices)) {

        const skipCompilation = (!dev && !toBuild.services) && !isDesktop(target)
        if (skipCompilation) continue // Skip builds for non-desktop unless otherwise specified


        // @ts-ignore
        const { build, base, filepath, __src, __compile, __autobuild } = resolvedService

        // if (!dev && !publish) continue // Avoid building unpublished services

        if (dev && !__compile && !__autobuild) continue // Skip services that don't have an original source or final filepath
        if (!__src) continue // Skip if source is undefined

        const allowCompilation = !(dev && __autobuild)

        const bundleConfig = {
            input: __src,
            output: filepath,
            force: true,
        } as any

        // Compile service when not in development mode or when the service is not autobuilt
        if (allowCompilation) {
            bundleConfig.compile = async function ({ src, out }) {

                const _chalk = await chalk

                if (!dev) console.log(`\n👊 Packaging ${_chalk.bold(name)} service\n`)

                // Detect when to package into an executable source
                const output = await buildService(
                    {
                        src,
                        build,
                        out,
                        root
                    },
                    name,
                    true // Always rebuild services
                )

                const toCopy = output === null ? null : output ?? (base ?? filepath)

                if (!existsSync(toCopy)) {
                    console.warn(`${_chalk.bold(`Missing ${_chalk.red(name)} build file`)}\nCould not find ${toCopy}`)
                    return null // Do not try to copy or bundle the missing file
                }

                return toCopy
            }
        }

        assets.bundle.push(bundleConfig)
    }

    return assets
}


export const clear = (outDir: string) => {
    if (existsSync(outDir)) {
        const rm = (path) => rmSync(path, { recursive: true, force: true }) // Clear output directory (similar to Vite)
        try { rm(outDir) } catch { rm(outDir) }
    }
}

type AssetsToBuild = { assets?: boolean, services?: boolean }

const resolveAssetInfo = (info, outDir, root) => {
    const isString = typeof info === 'string'
    const output = isString ? null : info.output
    const input = isString ? info : info.input
    const force = isString ? false : info.force
    const compile = isString ? false : info.compile

    const hasExplicitInput = typeof input === 'string'

    return {
        input,
        output: hasExplicitInput ? (typeof output === 'string' ? (force ? output : getAssetBuildPath(output, outDir)) : getAssetBuildPath(getAbsolutePath(root, input), outDir)) : output,
        force,
        compile
    }
}

export const buildAssets = async (config: ResolvedConfig, toBuild: AssetsToBuild = {}, dev = false) => {

    const _chalk = await chalk
    const _vite = await vite

    const { outDir } = config.build

    if (toBuild.assets !== false) {

        mkdirSync(outDir, { recursive: true }) // Ensure base and asset output directory exists

        // Write a package.json file to ensure these files are treated properly
        const randomId = Math.random().toString(36).substring(7)
        writeFileSync(join(outDir, 'package.json'), JSON.stringify({
            name: `commoners-build-${randomId}`,
            version: config.version,
            // type: 'module'
        }, null, 2)) // Write package.json to ensure these files are treated as commonjs
    }

    // Get other assets to be copied / bundled
    const assets = await getAssets(config, toBuild, dev)

    const outputs: AssetOutput[] = []

    const { root } = config

    const toCompile = assets.bundle.filter(o => o.compile)
    const toBundle = assets.bundle.filter(o => !o.compile)

    // Serially resolve services
    for (const info of toCompile) {
        const resolvedInfo = resolveAssetInfo(info, outDir, root)
        const { input, output, compile } = resolvedInfo
        const result = await compile({ src: input, out: output })

        if (!result) continue // Skip if no result

        // Copy results
        else if (existsSync(result)) assets.copy.push({ input: result, extraResource: true, sign: true })

        // Or attempt auto-bundle
        else toBundle.push({
            ...resolvedInfo,
            extraResource: true,
            sign: true
        })

    }

    // Create an assets folder with copied assets (ESM)
    await Promise.all(toBundle.map(async info => {

        // Just copy text to the output file
        if (typeof info !== 'string' && 'text' in info) {
            const { output } = info
            if (typeof output === 'string') {
                const outPath = getAssetBuildPath(output, outDir)
                mkdirSync(dirname(outPath), { recursive: true }) // Ensure base and asset output directory exists
                return writeFileSync(outPath, info.text)
            }
            else return // Nowhere to write the text
        }

        const { input, output } = resolveAssetInfo(info, outDir, root)

        // Transform an input file in some way    
        const inputExt = extname(input)
        const fileRoot = dirname(input)

        // Bundle HTML Files using Vite
        if (inputExt === '.html') {
        
            const outDir = dirname(output)

            await _vite.build({
                logLevel: 'silent',
                base: "./",
                root: fileRoot,
                build: {
                    emptyOutDir: false, // Ensure assets already built are maintained
                    outDir, // Configure the output directory of the linked build assets
                    rollupOptions: { input }
                },
            })

        }

        // Use ESBuild for specific files only
        else {

            const outputExtension = extname(output)

            if (basename(input, extname(input)) == 'commoners.config') await bundleConfig(input, output) // Bundle config file differently using Rollup
            else {

                const baseConfig: ESBuildBuildOptions = {
                    entryPoints: [input],
                    bundle: true,
                    logLevel: 'silent',
                    outfile: output
                }

                // Force a build format if the proper extension is specified
                const format = outputExtension === '.mjs' ? 'esm' : outputExtension === '.cjs' ? 'cjs' : undefined

                const esbuild = await import('esbuild')

                const buildForNode = () => buildForBrowser({
                    outfile: output,
                    platform: 'node',
                    external: ["*.node"]
                })

                const buildForBrowser = (opts = {}) => esbuild.build({ ...baseConfig, format, ...opts })

                if (outputExtension === 'cjs') await buildForNode()
                else await buildForBrowser().catch(buildForNode) // Externalize all node dependencies
            }


            // Handle extra resources
            const assetOutputInfo: AssetOutput = { file: output }
            if (typeof info === 'object') {
                assetOutputInfo.extraResource = info.extraResource
                assetOutputInfo.sign = info.sign
            }

            outputs.push(assetOutputInfo)
        }
    }))


    // Copy static assets
    assets.copy.map(info => {

        const isObject = typeof info === 'object'
        const file = isObject ? info.input : info
        const locationToEncode = (isObject ? info.output : undefined) ?? file

        const extraResource = isObject ? info.extraResource : false

        // Ensure extra resources are copied to the output directory
        const output: AssetOutput = { file: extraResource ? copyAssetOld(file, { outDir, root }) : copyAsset(file, getAssetBuildPath(locationToEncode, outDir)) }

        // Handle extra resources
        if (isObject) {
            output.extraResource = extraResource
            output.sign = info.sign
        }

        outputs.push(output)
    })

    return outputs
}


const importMetaResolvePlugin = () => {
    return {
        name: 'import-meta-resolve',
        resolveImportMeta: (_, { moduleId }) => `"${pathToFileURL(moduleId)}"` // Custom import.meta.url value
    }
}

export const bundleConfig = async (input, outFile, { node = false } = {}) => {

    const _vite = await vite

    const logLevel = 'silent'
    const outDir = dirname(outFile)
    const outFileName = basename(outFile)
    const extension = extname(outFile)

    const format = extension === '.mjs' ? 'es' : extension === '.cjs' ? 'cjs' : undefined


    const plugins = []

    const root = dirname(input)

    if (!node) {
        const nodePolyfills = await import('vite-plugin-node-polyfills').then(({ nodePolyfills }) => nodePolyfills)
        plugins.push(nodePolyfills())
    }

    const config = _vite.defineConfig({
        logLevel,
        base: "./",
        root,

        plugins,

        build: {
            lib: {
                entry: input,
                formats: [format],
                fileName: () => outFileName,
            },
            emptyOutDir: false,
            outDir,

            rollupOptions: {
                plugins: [
                    importMetaResolvePlugin() // Ensure import.meta.url is resolved correctly within each source file
                ]
            }
        }

    })

    const resolvedConfig = node ? withExternalBuiltins(config) : config

    const results = await _vite.build(resolvedConfig) as any[] // RollupOutput[]

    // Always return a flat list of the output file locations
    return results.map(({ output }) => output).flat().map(({ fileName }) => join(outDir, fileName))

}