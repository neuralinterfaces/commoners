/**
 * Build Adapter Interface
 *
 * Abstracts the frontend bundler (Vite, Rolldown, esbuild, etc.)
 * so the build flow and dev server are bundler-agnostic.
 *
 * Phase 1: Extract interface, wrap Vite as default adapter.
 * Phase 2: Replace direct Vite imports in BuildFlow/start.
 * Phase 3: Plugin adapter layer for non-Vite bundlers.
 */

import type { HooksInterface, ResolvedConfig } from '../types.js'

/**
 * Configuration passed to the build adapter
 */
export interface AdapterConfig {
  root: string
  outDir: string
  config: ResolvedConfig
  dev: boolean
  hooks: HooksInterface
}

/**
 * Result of a build operation
 */
export interface AdapterBuildResult {
  outDir: string
  assets: string[]
}

/**
 * Dev server returned by the adapter
 */
export interface AdapterDevServer {
  url: string
  close: () => Promise<void>
}

/**
 * Frontend bundler abstraction.
 * Implementations wrap a specific bundler (Vite, Rolldown, etc.)
 */
export interface BuildAdapter {
  /** Adapter identifier (e.g., 'vite', 'rolldown') */
  readonly name: string

  /**
   * Build frontend assets for production.
   * Replaces direct vite.build() calls in BuildFlow.
   */
  build(config: AdapterConfig): Promise<AdapterBuildResult>

  /**
   * Create a development server with HMR.
   * Replaces direct vite.createServer() calls in start.ts.
   */
  createDevServer(config: AdapterConfig): Promise<AdapterDevServer>

  /**
   * Load environment variables for the given mode/root.
   * Replaces vite.loadEnv() calls.
   */
  loadEnv(mode: string, root: string, prefix?: string): Record<string, string>

  /**
   * Merge two config objects (base + override).
   * Replaces vite.mergeConfig() calls.
   */
  mergeConfig(
    base: Record<string, unknown>,
    override: Record<string, unknown>
  ): Record<string, unknown>
}

/**
 * Service bundler interface for backend compilation.
 * Orthogonal to BuildAdapter — handles service binaries,
 * not frontend assets.
 */
export interface ServiceBundler {
  /** Bundler identifier (e.g., 'esbuild', 'cargo', 'pyinstaller') */
  readonly name: string

  /** File extensions this bundler handles */
  readonly extensions: string[]

  /**
   * Compile a service source file to an executable/module.
   */
  compile(options: {
    src: string
    out: string
    platform: string
    dev: boolean
  }): Promise<{ filepath: string }>
}
