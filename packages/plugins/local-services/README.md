# @commoners/local-services
Connect to shared services (exposed via `commoners share`) available on your local network on **desktop**.

## Arguments
- `port` - The port to use for the service gateway (`number`)
     - May also be represented by the `PORT` environment variable

- `isValid` - A function that returns whether or not a service should be connected to (`(ip, env) => boolean`)
    - `ip` - The IP address of the service (`localhost` if the current machine)
    - `env` - The service's environment variables

## Example
```js
import localServicesPlugin from '@commoners/local-services'

export default {
    plugins: [
        localServicesPlugin({
            port: 3768,
            isValid: (ip, env) => {
                if (ip === 'localhost') return true
                return env.SECRET_KEY === '****************'
            }
        })
    ]
}
```

With the above configuration, you would be able to discover shared services on your local machine by running `commoners share --port 3768`.