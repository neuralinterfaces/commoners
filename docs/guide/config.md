# Configuration
> **Note:** A `commoners.config.[ts|js]` file is required for proper resolution of [Plugins](../guide/plugins), which cannot be used with an inline configuration file loaded into the `@commoners/solidarity` API.

The `commoners.config` file is used to configure your application's services, plugins, and more. 

This is merged with the `package.json` file (e.g. `name`, `version`, etc.) to resolve the final configuration of your application.

## Common Configuration Options
### Name
The `name` property defines the name of your application. This value is used as the default `<title>` of your application and as the Electron application name.

```js
export default {
    name: 'My App',
}
```

### Icon
The `icon` property defines the path to the icon of your application. This value is used as the default `<link rel="shortcut icon">` of your application and as the Electron application icon.

```js
export default {
    icon: './assets/vite.png',
}
```

### Pages
The `pages` property defines the pages of your application. This value is a proxy for `vite.build.rollupOptions.input` and specifies which HTML files in your application should be built.

```js
export default {
    pages: {
        index: './src/index.html',
        about: './src/about.html',
    },
}
```


### Plugins
The `plugins` property defines the plugins of your application. This value is used to configure the plugins of your application.

```js
export default {
    plugins: {
        'commoners-plugin': {
            load: () => {
                console.log('Plugin loaded!')
            }
        },
    },
}
```

More information on plugins can be found in the [Plugins](../guide/plugins) documentation.

### Services
The `services` property defines the services of your application. This value is used to configure the services of your application.

```js
export default {
    services: {
        node: './src/services/server.ts',
    },
}
```

More information on services can be found in the [Services](../guide/services) documentation.

### Target
The `target` property defines the target of your application. This value is used to **change the default type of application** for the development and build commands.

```js
export default {
    target: 'desktop',
}
```

## Additional Properties
### App ID
The `appId` property defines the unique identifier of your application. This value is used as the default `appId` of your application and as the Electron application identifier.

```js
export default {
    appId: 'com.example.myapp',
}
```

If not specified, the `appId` is generated from the `name` property.

### Launch
The `launch` property defines the launch options of your application that aren't covered by the standard configuration.

```js
export default {
    target: 'desktop',
    outDir: 'dist',
    launch: {
        port: 3000,
    },
}
```

### Build
The `build` property defines the build options of your application that aren't covered by the standard configuration.

```js
export default {
    target: 'desktop',
    outDir: 'dist',
    build: {
        publish: true,
        sign: false
    },
}
```


### Electron
The `electron` property defines the Electron options of your application. This value is used to configure the Electron options of your application.

```js
export default {
    electron: {
        nodeIntegration: true
        window: {
            width: 800,
            height: 600,
        }
    },
}
```

### Vite
The `vite` property defines the Vite options of your application. This value is used to configure the Vite options of your application.

```js
export default {
    vite: {
        server: {
            port: 3000,
        },
    },
}
```

This can also be specified using a `vite.config.js` file in the root of your project, or an alternative configuration file using the `vite` property.

```js
export default {
    vite: './config.vite.js',
}
```


<!-- ## PWA
The `pwa` property defines the PWA options of your application. This value is used to configure the PWA options of your application.


```js
export default {
    pwa: {
        includeAssets: ['favicon.ico'],
        manifest: {
            name: 'My App',
            short_name: 'My App',
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone',
            start_url: '/',
            icons: [
                {
                    src: '/assets/icons/icon-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                },
                {
                    src: '/assets/icons/icon-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                },
            ],
        },
    }
}
``` -->
