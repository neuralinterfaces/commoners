# Getting Started
Welcome to Commoners! This guide will help you get started with building your first cross-platform application.

Since Commoners is built on top of [Vite](https://vitejs.dev), you can use the `create-vite` package to scaffold a new project. To do this, run the following command in your terminal:

```bash
npm create vite@latest my-commoners-app
```

Follow the prompts to select your favorite framework and features.

## Installing `commoners`
After running `npm install`, add Commoners as a dependency:

```bash
npm install commoners
```

## Configuring the `package.json` File
Then, modify `scripts` in your `package.json` to include the following:

```json
{
    "scripts": {
        "start": "commoners --target desktop",
        "dev": "commoners",
        "build": "npm run build:desktop",
        "build:web": "commoners build",
        "build:desktop": "commoners build --target desktop",
    }
}
```

Now you can run `npm start` to start your application as an Electron desktop application, `npm run dev` to start your application as a web application, and the tagged `npm run build` commands to create different distributions of your application.


## Customizing Your Application
`commoners` allows you to customize your application by adding a `commoners.config.js` file to the root of your project. This file can be used to configure your application's services, plugins, and more.

For example, you can add the following to your `commoners.config.js` file to customize your application's name and icon:

```js
export default {
    name: 'My App',
    icon: 'icon.png',
}
```

All of the available configuration options are documented in the [Configuration](./config.md) documentation.

## Adding Services
Coming soon...


