# Getting Started
Welcome to Commoners! In this guide, you'll build your first cross-platform application using Commoners in a few simple steps.


Since Commoners is built on top of [Vite](https://vitejs.dev), you can use the `create-vite` package to scaffold a new project. To do this, run the following command in your terminal:

```bash
npm create vite@latest my-commoners-app
```


Follow the prompts to select your favorite framework and features.

Then, navigate to your new project directory and run `npm install` to install the project dependencies.

## Commoners Setup
### Installation
After running `npm install`, add Commoners as a dependency.

```bash
npm install -D commoners@0.0.61
```

### Scripts
Modify `scripts` in the `package.json` to provide simple commands for starting, building, and launching your application.

```json
{
    "scripts": {
        "start": "commoners",
        "build": "commoners build",
        "launch": "commoners launch"
    }
}
```

## Commoners Usage
### Configuration
You can customize your Commoners application by adding a `commoners.config.js` file to the root of your project. 

Add the following to your `commoners.config.js` file to customize your application's name and icon:

```js
export default {
    name: 'My App',
    icon: {
        svg: './public/vite.svg', // Preferred format
        png: './public/vite.png', // Electron Icon: A 512x512 PNG file converted using https://svgtrace.com/svg-to-png
    }
}
```

The `name` and `icon` fields will automatically configure your application's `<title>` and `<link rel="icon">` tags. Delete these in the `index.html` file and see what happens!

For more advanced configuration options, check out the [Configuration](./guide/config.md) documentation.

#### Accessing Configuration Options
In your application, you can access many Commoners configuration items using the `commoners` object:

```js
console.log(commoners) // { NAME: 'My App', VERSION: '0.0.0', ICON: '<path>', DESKTOP: true, READY: Promise, SERVICES: { ... }, ... }
```

Try replacing the default `h1` and `img` tags with your custom `NAME` and `ICON` using the `commoners` global variable!

### Multi-Platform Development
Commoners allows you to develop for web, desktop, and mobile platforms using the same codebase. To switch between platforms, use the `--target` flag.

```bash
npm start -- --target desktop # Develop for desktop
npm start -- --target android # Develop for Android
npm start -- --target ios # Develop for iOS
```

To change the default platform, modify the `target` field in your `commoners.config.js` file:

```js
export default {
    target: 'desktop', // Overrides `web` as the default target
}
```


### Building Your Application
To build your application, run one of the following commands:

```bash
npm run build # Default target

# Web
npm run build -- --target web # Basic web application
npm run build -- --target pwa # Progressive Web App (PWA)

# Desktop
npm run build -- --target electron # Electron 
npm run build -- --target desktop # Currently the same as `electron`

# Mobile
npm run build -- --target android # Android
npm run build -- --target ios # iOS (requires macOS)
npm run build -- --target mobile # Inferred based on current platform
```

### Launching Your Application
After building your application, you can launch it using the following commands:

```bash
npm run launch # Default target
npm run launch -- --target [target] # Launches the specified target
```

The outputs of any `build` command should be launched by the equivalent `launch` command.

## Conclusion
Congratulations! You've built your first cross-platform application using Commoners. 

For more advanced features, check out the [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit) on GitHub.