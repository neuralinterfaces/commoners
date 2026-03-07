# Getting Started
Welcome to Commoners! In this guide, you'll build your first cross-platform application in a few simple steps.

## Scaffolding a New Project

The fastest way to get started is with `create-commoners`:

::: code-group

```bash [pnpm]
pnpm create commoners my-app
```

```bash [npm]
npm create commoners my-app
```

```bash [yarn]
yarn create commoners my-app
```

:::

This scaffolds a complete Commoners project with:
- A TypeScript HTTP **service** with environment variable support
- A **splash screen** plugin
- Multiple **pages** with navigation
- **Environment files** (`.env`, `.env.development`, `.env.production`)
- Scripts for web, desktop, and mobile builds

Navigate to your new project and install dependencies:

```bash
cd my-app
pnpm install
```

### Adding Commoners to an Existing Vite Project

If you already have a Vite project, you can add Commoners directly:

```bash
pnpm add -D commoners@latest
```

Then create a `commoners.config.ts` file in your project root (see [Configuration](./guide/config.md)) and update your `package.json` scripts:

```json
{
    "scripts": {
        "dev": "commoners",
        "build": "commoners build",
        "preview": "commoners launch"
    }
}
```

## Development

Start the development server:

```bash
pnpm dev
```

This launches your app with hot module replacement, and starts any configured services.

### Configuration
Customize your application by editing the `commoners.config.ts` file in the root of your project.

```ts
import { defineConfig } from '@commoners/solidarity/config'

export default defineConfig({
    name: 'My App',
    icon: [
        './public/icon.png',
        './public/icon.svg'
    ]
})
```

The `name` and `icon` fields automatically configure your application's `<title>` and `<link rel="icon">` tags.

For more advanced configuration options, check out the [Configuration](./guide/config.md) documentation.

### Accessing Configuration at Runtime
In your application, you can access Commoners configuration using the `commoners` global:

```js
console.log(commoners) // { NAME: 'My App', VERSION: '0.0.0', ICON: '<path>', DESKTOP: true, READY: Promise, SERVICES: { ... }, ... }
```

## Multi-Platform Development
Commoners lets you develop for web, desktop, and mobile platforms from the same codebase. Use the `--target` flag to switch platforms:

```bash
pnpm dev                    # Web (default)
pnpm dev -- --target desktop  # Desktop (Electron)
pnpm dev -- --target ios      # iOS
pnpm dev -- --target android  # Android
```

## Building Your Application

```bash
pnpm build                          # Default target (web)
pnpm build -- --target pwa          # Progressive Web App
pnpm build -- --target desktop      # Desktop (Electron)
pnpm build -- --target mobile       # Mobile (Capacitor)
```

### Launching a Build
After building, launch the output:

```bash
pnpm preview                        # Default target
pnpm preview -- --target desktop    # Launch desktop build
```

## Next Steps
- [Configuration](./guide/config.md) — Customize your app
- [Services](./guide/services.md) — Add backend services
- [Plugins](./guide/plugins.md) — Extend with plugins
- [Build Automation](./guide/build-automation.md) — CI/CD workflows for all platforms
- [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit) — Reference project with GitHub Actions CI for web, desktop, and mobile
