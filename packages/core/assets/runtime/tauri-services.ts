/**
 * Runtime service URLs under Tauri.
 *
 * The generated Tauri app picks a free port for each sidecar when it launches, so the URLs
 * written into the page at build time are stale. This asks the app for the live ones
 * (commoners_get_services) and updates commoners.SERVICES in place, keeping its shape.
 */

type ExposedServices = Record<string, { url?: string; [key: string]: unknown }>
type RuntimeServices = Record<string, { url?: string; status?: boolean }>

// Take the runtime port (and scheme, for SSL sidecars) and keep the rest of the declared URL
export function applyRuntimeServices(services: ExposedServices, runtime: RuntimeServices) {
  if (!services || !runtime) return services
  for (const [id, info] of Object.entries(runtime)) {
    const service = services[id]
    if (!service || !info?.url) continue
    try {
      const url = new URL(service.url ?? info.url)
      const live = new URL(info.url)
      url.protocol = live.protocol
      url.port = live.port
      service.url = url.href
    } catch {
      service.url = info.url
    }
  }
  return services
}

// Resolves once SERVICES is up to date. Without the command (dev mode, where Node runs the
// services at their build-time ports, or an app without sidecars) the URLs stay as they are.
export async function resolveTauriServices(services: ExposedServices) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const runtime = await invoke<RuntimeServices>('commoners_get_services')
    return applyRuntimeServices(services, runtime)
  } catch {
    return services
  }
}
