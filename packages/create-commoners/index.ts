import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, basename, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const templateDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'template')

// Files that get renamed from underscore-prefixed to dot-prefixed
const renameFiles: Record<string, string> = {
  _gitignore: '.gitignore',
  _env: '.env',
  '_env.development': '.env.development',
  '_env.production': '.env.production',
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function toValidPackageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-._~]/g, '-')
    .replace(/^[._]/, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function isEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true
  const files = readdirSync(dir)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    if (entry === 'node_modules') continue
    const srcPath = join(src, entry)
    const destName = renameFiles[entry] ?? entry
    const destPath = join(dest, destName)

    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

function emptyDir(dir: string) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue
    const fullPath = join(dir, entry)
    rmSync(fullPath, { recursive: true, force: true })
  }
}

async function main() {
  let targetDir = process.argv[2]

  if (!targetDir) {
    targetDir = await prompt('Project name: ')
  }

  if (!targetDir) {
    console.error('A project name is required.')
    process.exit(1)
  }

  const root = resolve(targetDir)
  const projectName = toValidPackageName(basename(root))

  if (!isEmpty(root)) {
    const answer = await prompt(`Directory "${relative(process.cwd(), root) || '.'}" is not empty. Remove existing files and continue? (y/N) `)
    if (answer.toLowerCase() !== 'y') {
      console.log('Cancelled.')
      process.exit(0)
    }
    emptyDir(root)
  }

  console.log(`\nScaffolding project in ${root}...\n`)

  copyDir(templateDir, root)

  // Update package.json name
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.name = projectName
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  const pkgManager = process.env.npm_config_user_agent?.split('/')[0] ?? 'pnpm'

  console.log('Done! Now run:\n')
  if (root !== process.cwd()) {
    console.log(`  cd ${relative(process.cwd(), root)}`)
  }
  console.log(`  ${pkgManager} install`)
  console.log(`  ${pkgManager} run dev`)
  console.log()
  console.log('Build targets:')
  console.log(`  ${pkgManager} run build           # PWA`)
  console.log(`  ${pkgManager} run build:desktop    # Desktop (Electron)`)
  console.log(`  ${pkgManager} run build:mobile     # Mobile (Capacitor)`)
  console.log()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
