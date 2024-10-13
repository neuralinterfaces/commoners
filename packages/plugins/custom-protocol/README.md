# @commoners/custom-protocol
A plugin for adding custom protocol support to your Electron application.

## Usage
```js
import customProtocolPlugin from '@commoners/custom-protocol'

export default {
    plugins: {
        protocol: customProtocolPlugin('my-application-protocol', { supportFetchAPI: true })
    }
}
```