# @commoners/local-services
Share and connect to services available on your local network (**desktop** only).

## Arguments
- `isValid` - A function that returns whether or not a service should be connected to (`(ip, env) => boolean`)
    - `ip` - The IP address of the service (`localhost` if the current machine)
    - `env` - The service's environment variables

- `port` - The port to use for the service gateway (`number`)
    - Optional if you have a `COMMONERS_SHARE_PORT` environment variable


## Example
```js
import localServicesPlugin from '@commoners/local-services'

export default {
    plugins: [
        localServicesPlugin((ip, env) => {
            if (ip === 'localhost') return true
            return env.SECRET_KEY === '****************'
        }, 3768)
    ]
}
```

With the above configuration, you would be able to discover shared services on your local machine by running `commoners share --port 3768`.