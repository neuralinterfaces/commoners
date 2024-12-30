# @commoners/local-services
Register and monitor services available on your local network

Available across **desktop** usage. Only available in development for **web** and **mobile**.

## Example
```js
import localServicesPlugin from '@commoners/local-services'

export default {
    plugins: {               
        localServices: localServicesPlugin({ register: [ 'http', 'numpy', 'cpp' ] }), // Register and listen for specified services
        // allLocalServices: localServicesPlugin({ register: true }), // Register and listen for all services
        listenForLocalServices: localServicesPlugin({ type: 'http' }) // Only listen for HTTP services
    }
}
```