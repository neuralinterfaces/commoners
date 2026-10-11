---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: Commoners
  tagline: From prototype to product, for everyone
  text: An orchestration layer that keeps every platform simple. One config for web, Tauri, Electron and Capacitor. Secure by default, and every build shows its work.
  image:
    src: /logo-min.png
    alt: Commoners
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Why Commoners?
      link: /why
features:
  - icon: 🌐
    title: Simple on Every Platform
    details: One commoners.config.ts for the browser, Tauri or Electron on desktop, and Capacitor on iOS and Android. Commoners adds the layer, not another runtime.
  - icon: 🧩
    title: Services in Any Language
    details: Python, Rust, C++, WASM or Node, declared in config. Each is built for the target, bundled, started, health-checked and stopped with your app — local on desktop, remote for web and mobile, with the same frontend code.
  - icon: 🛡️
    title: Secure by Default
    details: One Content Security Policy across web, Electron and Tauri. Isolation and sandboxing on, and external links limited to web and mail protocols. Opt in to check signed service binaries against your publisher at launch. commoners verify-headers checks a deployment.
    link: /guide/security
  - icon: 📋
    title: Every Build Shows Its Work
    details: Production builds write a CycloneDX SBOM of what actually shipped, and a manifest of settings, features and file hashes tied to the source commit.
    link: /guide/config#build-record
  - icon: ✂️
    title: Ship Only What a Build Needs
    details: Declare features per target. Disabled code is removed at build time, and the manifest records which features each build has.
  - icon: 🔩
    title: Plugins
    details: Bluetooth, Serial, multi-window and auto-update, kept out of your app logic. Most plugins are Electron-only today.
---
