# Why Commoners?

## The Problem
If WebViews can render HTML, CSS, and JavaScript applications on web, desktop, and mobile environments, *why is it so hard to publish across all these platforms?*

The story only gets more complicated when you consider the need for advanced features like custom backends, Bluetooth and serial communication, and the reconciliation of other platform-specific APIs.

In particular, Commoners was developed for an impossible task in modern web development: The distribution of a single Bluetooth-enabled application across web (Chrome), desktop (Mac/Windows/Linux) and mobile (iOS/Android) platforms. And [it works](https://github.com/neuralinterfaces/brainsatplay)!

## The Solution
With a basic knowledge of HTML, CSS, and JavaScript, **anyone can write cross-platform applications** with Commoners.

 Commoners serves as a **fully-stocked laboratory for application development**. It provides a consistent development workflow across all platforms, allowing you to focus on what matters: your application.

## The Alternatives
Sometimes Commoners will not be the best solution for your project. Here are some alternatives to consider:

### Framework-Specific SDKs
- [React Native](https://reactnative.dev) - React Native is a powerful cross-platform solution that requires **React** as its primary frontend framework.
- [Quasar](https://quasar.dev) - Quasar is a powerful cross-platform solution that requires **Vue.js** as its primary frontend framework.

### Non-JavaScript SDKs
- [Flutter](https://flutter.dev) - While Flutter is an elegant cross-platform solution, it uses **Dart** as its primary language. This is a barrier to entry for many developers.

### Full Native Development
- [Swift](https://developer.apple.com/swift/) - Swift is a powerful language for developing iOS applications.
- [Kotlin](https://kotlinlang.org) - Kotlin is a powerful language for developing Android applications.
- [C++](https://isocpp.org) - C++ is a powerful language for developing desktop applications.

While WebViews will never be as performant as full native applications, Commoners is designed to make the most of their potential. Consequently, Commoners applications are more than enough for many sophisticated PoCs, MVPs, and production applications—including, as we've shown at [Neural Interfaces](https://github.com/neuralinterfaces), time-sensitive brain-computer interface (BCI) systems.

### Platform-Specific Tools
We love the following tools and use them in Commoners to provide you with a reliable and streamlined development workflow.

- [Vite](https://vitejs.dev) - Vite is a lightning-fast build tool for modern web development. It is a foundational piece of the Commoners, providing a streamlined development workflow for all platforms.
- [Electron](https://www.electronjs.org) - Electron is a powerful framework for building cross-platform **desktop** applications using Chromium and Node.js.
- [Capacitor](https://capacitorjs.com) - Capacitor is a powerful framework for building cross-platform **mobile** applications using WebViews. Native plugins are available for advanced features.

While direct use of `vite`, `electron`, and `capacitor` will be beneficial for some situations, Commoners provides a few key advantages over these platform-specific solutions:
1. Separates platform-specific code from the core, allowing you to focus on what matters.
2. Maintains a consistent development workflow across all your projects.
3. Allows you to prototype features for different platforms—web, desktop, mobile, or all at once—to decide the ideal form factor for your application.
4. Provides community plugins for advanced features such as Bluetooth and serial communication, discovery of local services, and more.
5. Automatically packages local backends into your desktop builds.

#### Future Integrations
- [Tauri](https://tauri.app) - A promising solution for distributing cross-platform applications as WebViews. We are currently evaluating Tauri for inclusion in Commoners.