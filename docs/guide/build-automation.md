# Build Automation
Using GitHub Actions, you can automatically build and publish your application to web, desktop, and mobile platforms.

## Desktop
To configure `electron-builder` to publish to a private repository, add the following to your `commoners.config.js`:

```js
export default {
    electron: {
        build: {
            publish: {
                provider: 'github',
                private: true
            }
        }
    }
}