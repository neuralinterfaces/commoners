# @commoners/splash-screen
A plugin for adding a splash screen to your application

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