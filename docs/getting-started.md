# Getting Started
Welcome to Commoners! In this guide, you'll build your first cross-platform application using Commoners in a few simple steps.


Since Commoners is built on top of [Vite](https://vitejs.dev), you can use the `create-vite` package to scaffold a new project. To do this, run the following command in your terminal:

```bash
npm create vite@latest my-commoners-app
```

Follow the prompts to select your favorite framework and features.

## Installing `commoners`
After running `npm install`, add Commoners as a dependency:

```bash
npm install -D commoners@0.0.59
```

## Configuring the `package.json` File
Then, modify `scripts` in your `package.json` to include the following:

```json
{
    "scripts": {
        "start": "commoners --target desktop",
        "dev": "commoners",
        "build": "commoners build"
    }
}
```

Now you have simple commands to start your application as an Electron desktop application (`npm start`), start as a web application (`npm run dev`), and build different distributions of your application (`npm run build`).


## Creating a Configuration File
`commoners` allows you to customize your application by adding a `commoners.config.js` file to the root of your project. This file can be used to configure your application's services, plugins, and more.

For example, you can add the following to your `commoners.config.js` file to customize your application's name and icon:

```js
export default {
    name: 'My App',
    icon: './assets/vite.png', // Manually converted from public/vite.svg
}
```

All of the available configuration options are documented in the [Configuration](./guide/config.md) documentation.

In your built application, you can access Commoners configuration values using the `commoners` object:

```js
console.log(commoners) // { NAME: 'My App', VERSION: '0.0.0', ICON: '<path>', DESKTOP: true, READY: Promise, SERVICES: { ... }, ... }
```

Try replacing the default `h1` and `img` tags with your custom `NAME` and `ICON` using the `commoners` global variable!

## Building for Production
To build your application for production, run one of the following commands:

```bash
commoners build # Uses the `target` field of the configuration. Defaults to `web`.

# Web
commoners build --target web # Basic web application
commoners build --target pwa # Progressive Web App (PWA)

# Desktop
commoners build --target desktop # Electron

# Mobile
commoners build --target android # Android
commoners build --target ios # iOS (requires macOS)
commoners build --target mobile # Inferred based on current platform
```


## Conclusion
Congratulations! You've built your first cross-platform application using Commoners. 

For more advanced features, check out the [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit) on GitHub.