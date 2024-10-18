# @commoners/windows
A plugin for spawning multiple windows in your Commoners application

## Usage
```js
import splashPagePlugin from '@commoners/splash-screen'

export default {
    plugins: {
        protocol: splashPagePlugin("splash.html", { 
            duration: 2000, 
            window: { width: 500, height: 500 }
        })
    }
}
```