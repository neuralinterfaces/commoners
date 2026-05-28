# Local Service Networks

This walkthrough covers how to use `@commoners/local-services` to discover and share services across devices on your local network using Bonjour/mDNS.

## How It Works

The `@commoners/local-services` plugin uses [Bonjour](https://developer.apple.com/bonjour/) (mDNS/DNS-SD) to:

1. **Advertise** your app's services on the local network
2. **Discover** other commoners apps publishing services nearby
3. **Notify** your frontend when services appear or disappear

This enables multi-device workflows — for example, a desktop app publishing a data service that mobile devices on the same network can discover and consume.

## Platform Availability

| Platform | Supported | Notes |
|----------|-----------|-------|
| Desktop (Electron) | Yes | Full Bonjour support via `bonjour-service` |
| Development (Dev Server) | Yes | Services are advertised during `commoners start` |
| Web (Production PWA) | No | Browsers cannot access mDNS directly |
| Mobile | No | Requires native Bonjour bridge (future work) |

## Setup

### 1. Install the Plugin

```bash
pnpm add @commoners/local-services
```

### 2. Configure in `commoners.config.ts`

```ts
import localServicesPlugin from '@commoners/local-services'

export default {
  plugins: {
    localServices: localServicesPlugin({
      type: 'http',              // Bonjour service type (default: 'http')
      register: ['api', 'data'], // Services to advertise, or `true` for all
    }),
  },

  services: {
    api: {
      src: './services/api.ts',
    },
    data: {
      src: './services/data.ts',
    },
  },
}
```

### 3. Register Services

The `register` option controls which of your services are advertised on the network:

- `register: ['api']` — Only advertise the `api` service
- `register: true` — Advertise all services
- `register: []` — Don't advertise, only discover

Registered services are automatically marked as `public: true`, which binds them to `0.0.0.0` instead of `localhost`, making them accessible from other devices.

## Frontend API

In your frontend code, access the plugin through `commoners.PLUGINS`:

```ts
// Wait for plugins to load
const plugins = await commoners.READY

// Get the local services plugin
const localServices = plugins.localServices

// Get all currently visible services on the network
const services = await localServices.getServices()
// Returns: { 'http://192.168.1.5:3000': { name, host, ip, url, metadata } }

// Listen for new services appearing
localServices.onServiceUp(service => {
  console.log('New service found:', service.name, service.url)
})

// Listen for services disappearing
localServices.onServiceDown(service => {
  console.log('Service lost:', service.name)
})
```

### Service Object

Each discovered service has the following shape:

```ts
{
  name: string       // Bonjour service name (e.g., 'commoners-localServices-api')
  host: string       // Hostname
  ip: string         // IP address
  url: string        // Full URL (e.g., 'http://192.168.1.5:3000')
  metadata: object   // TXT record metadata
}
```

## Example: Cross-Device Data Sharing

**Desktop app (publisher):**
```ts
// commoners.config.ts
export default {
  plugins: {
    localServices: localServicesPlugin({
      register: ['data'],
    }),
  },
  services: {
    data: { src: './services/data-server.ts' },
  },
}
```

**Second device (consumer):**
```ts
// In your frontend
const localServices = (await commoners.READY).localServices

localServices.onServiceUp(async service => {
  if (service.name.includes('data')) {
    const response = await fetch(`${service.url}/latest`)
    const data = await response.json()
    renderData(data)
  }
})
```

## Lifecycle

1. **`start` phase:** The plugin initializes Bonjour, begins browsing for services, and marks registered services as public
2. **`ready` phase:** After services have launched with assigned ports, the plugin publishes them to the network
3. **`quit` phase:** All published services are unpublished, the browser is stopped, and Bonjour is destroyed

## Future: `commoners share` CLI Command

A planned `commoners share` command will provide a streamlined way to share services:

```bash
# Advertise all services in the current project
commoners share

# Advertise specific services
commoners share --services api,data

# Share with custom metadata
commoners share --meta "version=1.0,lab=neuroscience"
```

This command will:
- Start the specified services
- Advertise them on the local network via Bonjour
- Display a QR code for mobile devices to connect
- Provide a TUI showing connected clients

The `@commoners/local-services` plugin will remain the programmatic API, while `commoners share` will be the CLI interface for quick sharing workflows.
