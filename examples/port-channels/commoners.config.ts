// Two windows exchanging a 60 Hz stream through port channels (ctx.sendPort / ctx.onPort).
// One page in two roles: the main window sends, the popup reports frame count, gaps and latency.
import { join } from 'node:path'
import { getDirname } from '@commoners/solidarity/config'
import windowsPlugin from '@commoners/windows'

const root = getDirname(import.meta.url)

export default {
  name: 'Port Channels',
  target: 'desktop',
  icon: './icon.png',
  desktop: { backgroundThrottling: false }, // Keep the stream at full rate when a window is hidden
  // Tauri: a Rust plugin receives the tapped stream (see rust/)
  tauri: { plugin: { path: './rust', permissions: ['sense:allow-frames'] } },
  plugins: {
    windows: windowsPlugin({
      receiver: { src: join(root, 'index.html'), window: { width: 640, height: 220 } },
    }),
    // Exposes the plugin context's port channels to the pages
    stream: {
      load() {
        return {
          sendPort: (channel: string, port: MessagePort) => this.sendPort(channel, port),
          onPort: (channel: string, listener: (port: MessagePort) => void) =>
            this.onPort(channel, listener),
          tapPort: (channel: string, command: string) => this.tapPort(channel, command),
        }
      },
    },
  },
}
