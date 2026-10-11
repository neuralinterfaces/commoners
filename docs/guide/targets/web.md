# Web

Web is the default target. Your app is built as a static site and can be deployed to any web hosting provider.

```bash
# Development
commoners

# Production build
commoners build
```

## Deployment

The build output is in your configured `outDir` (default: `.commoners/`). Deploy it to any static hosting:

| Provider | Command |
|----------|---------|
| **Vercel** | `vercel deploy .commoners` |
| **Netlify** | `netlify deploy --dir=.commoners` |
| **GitHub Pages** | Copy build output to `gh-pages` branch |
| **Any static host** | Upload the contents of the output directory |

## Services on Web

Backend services declared in your config **run remotely** when targeting web. Configure the remote URL in your service's `publish` field:

```ts
export default {
  services: {
    api: {
      src: './services/api.ts',       // Used in desktop (local)
      publish: 'https://api.myapp.com' // Used on web (remote)
    }
  }
}
```

Your frontend code doesn't change — `commoners.services.api.url` resolves to the local or remote URL automatically.

## PWA

Progressive Web Apps can be installed on devices and accessed from the home screen. Enable PWA with:

```bash
commoners build --target pwa
```

Commoners uses [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) under the hood. Configure the PWA manifest in your config:

```ts
export default {
  pwa: {
    manifest: {
      short_name: 'My App',
      theme_color: '#ffffff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ]
    }
  }
}
```

### What PWA gives you
- Installable on desktop and mobile via the browser's "Add to Home Screen"
- Offline support via service workers (configured by vite-plugin-pwa)
- App-like experience without app store distribution

### Limitations
- No access to native APIs (Bluetooth, Serial, filesystem) without a desktop/mobile build
- Service workers cache static assets; backend services still require network access
- iOS Safari has limited PWA support (no push notifications, restricted background execution)
