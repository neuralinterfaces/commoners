# Plugins

> **Tip:** Plugins and services can also be declared together as **extensions** via the `extensions` config key. Extensions are auto-classified based on their properties. See [Extensions](#extensions) below.

Plugins are collections of JavaScript functions that run at different points during app initialization. These points include:

1. `load` - After the DOM is loaded
2. `start` - Run on application launch (desktop builds only)
3. `ready` - Run after the application is ready (desktop builds only)
4. `desktop.load` - Run after each window is created in the application (desktop builds only)
5. `desktop.unload` - Run after each window is closed (desktop builds only)
6. `quit` - Run before the app exits (desktop builds only)

> **Note:** Official plugins can be found in the `@commoners` namespace on NPM, and are listed in the [official plugins](../packages/plugins.md#official-plugins) section.

## Basic Plugin

To add a new plugin, provide a named `Plugin` on the `plugins` registry of your [Configuration File](./config.md):

```js
export default {
    plugins: {
        myPlugin: {
            isSupported: {
                load: ({ DEV, WEB, DESKTOP, MOBILE }) => DEV || DESKTOP,
                start: ({ DEV, DESKTOP }) => DEV || DESKTOP,
                ready: ({ DEV, DESKTOP }) => DEV || DESKTOP,
                quit: ({ DEV, DESKTOP }) => DEV || DESKTOP,
            },
            load: () => console.log('loaded in renderer'),
            start: (serviceConfigs) => console.log('app started'),
            ready: (activeServices) => console.log('app ready'),
            quit: () => console.log('app quitting'),
            desktop: {
                load: () => console.log('window created'),
                unload: () => console.log('window closed')
            }
        }
    }
}
```

## Using Plugins

Plugins may return values from their `load()` function. Access them via the `READY` promise:

```js
const { READY } = commoners
READY.then(({ myPlugin }) => {
    if (myPlugin) myPlugin.doSomething()
})
```

Global variables will be loaded from your `.env` file (if present), which you can use in `desktop` load functions.

## Lifecycle Execution Order

On desktop targets, plugin hooks execute in this order:

1. **`start()`** — All plugins run concurrently via `Promise.all`. Register IPC handlers here.
2. **`ready()`** — Plugins run **sequentially**, one at a time. Safe for creating windows whose renderers call other plugins' IPC handlers.
3. **Main window created** — Only after all `ready()` hooks complete.
4. **`desktop.load()`** — Runs per-window when each BrowserWindow loads.
5. **`quit()`** — Runs concurrently when the app exits.

### Error Isolation

Each plugin's hook runs in a try/catch. If one plugin throws, other plugins still execute. Errors are logged as `[commoners] pluginName plugin (hookType) failed to execute:`.

## Dependency Ordering with `after`

Plugins can declare dependencies to control `ready()` execution order:

```js
export default {
    plugins: {
        database: databasePlugin,
        security: securityPlugin,

        // Auth runs after security's ready() completes
        auth: {
            ...authPlugin('./auth.html'),
            after: ['security'],
        },

        // Idle detection runs after auth completes
        idleDetection: {
            ...idlePlugin('./idle.html'),
            after: ['auth'],
        },
    }
}
```

`after` ensures the named plugins complete their `ready()` hooks before this plugin's `ready()` starts. This is resolved via topological sort — the framework detects circular dependencies and falls back to config order with a warning.

Without `after`, plugins run in the order they appear in the config object. Use `after` when:
- A plugin creates a window in `ready()` that depends on another plugin's IPC handlers
- A plugin gates app access (e.g., auth splash screen) and must run after setup plugins
- You want ordering resilient to config key reordering

## Capabilities

Plugins can declare what they provide and where they run:

```js
export default {
    plugins: {
        bluetooth: {
            capabilities: {
                provides: ['bluetooth', 'scanning'],
                platforms: { desktop: 'electron', mobile: true },
                runtime: 'process',
                requires: ['serial'],
            },
            // ... hooks
        }
    }
}
```

Query capabilities at runtime with `commoners.query({ provides: ['bluetooth'] })`. See the [API Reference](../reference/api.md#extension-querying) for details.

## IPC Communication

In desktop builds, plugins communicate between the main process and renderer via scoped IPC:

**Main process** (`start` / `ready` hooks):
```js
export function start() {
    // Register a handler (renderer calls this.invoke('echo', msg))
    this.handle('echo', (event, message) => message)

    // Listen for one-way messages
    this.on('log', (event, data) => console.log(data))

    // Send to all windows
    this.send('notification', { text: 'Hello' })
}
```

**Renderer** (`load` hook):
```js
export function load() {
    return {
        echo: (msg) => this.invoke('echo', msg),
        notify: () => this.send('log', 'something happened'),
    }
}
```

IPC channels are automatically scoped to `plugins:{pluginId}:{channel}` and validated against an allowlist.

## Lazy Loading

Plugin hooks support lazy factories for tree-shaking:

```js
import { lazy } from '@commoners/solidarity'

export default {
    plugins: {
        heavyPlugin: {
            start: lazy(() => import('./heavy-start')),
            ready: lazy(() => import('./heavy-ready')),
            desktop: lazy(() => import('./heavy-desktop')),
        }
    }
}
```

The factory is called once at first use, then cached for subsequent calls.

## Extensions

Extensions unify plugins and services under a single config key. The framework auto-classifies each extension based on its properties:

```js
export default {
    extensions: {
        // Pure plugin (has load/start/ready hooks)
        auth: authPlugin,

        // Pure service (has src or url)
        api: { src: './services/api/index.ts' },

        // Hybrid (has both plugin hooks and service properties)
        reporting: {
            src: './services/reporting/main.py',
            load: () => ({ generate: (params) => this.invoke('generate', params) }),
            ready: (services) => { /* setup */ },
            capabilities: { provides: ['reporting'] },
        },
    }
}
```

Internally, the framework resolves extensions into a `ResolvedExtensions` map with `type: 'plugin' | 'service' | 'hybrid'`. The legacy `plugins` and `services` config keys still work and are merged into the extensions system.
