# Why Commoners?
Web clients render everywhere already—browsers, Webviews, iOS applications, smartwatches, and more. So why is it so hard to publish the same application acorss all these platforms?

Commoners allows anyone to build hybrid applications—distributed on web, desktop, and mobile from the same codebase / configuration—without the hassle of additional languages and required JavaScript libraries.

This tool was originally developed to support the deployment of the same Bluetooth-enabled application across web, desktop, and mobile—an impossible feat using existing JavaScript tooling.

### Why Shouldn't I Just Create a Custom Electron App?
Unlike a custom application, Commoners lets you:
1. Separate platform code (e.g. Electron infrastructure) from your code, allowing you to focus on what matters.
2. Prototype features on different platforms, allowing you to decide the ideal form factor for your application—web, desktop, mobile, or all at once.
3. Quickly design different clients to take advantange of the affordances of each platform.
    - Add a backend—and optionally bundle this locally in your `desktop` build—by providing the path to your source files. That's it!
4. Leverage community plugins for advanced features (e.g. `bluetooth`, `serial`, `local-services`, etc.)

## Competitors
- [React Native](https://reactnative.dev) - While React Native is a popular cross-platform solution, it assumes a React-based frontend—limiting its flexibility.
- [Flutter](https://flutter.dev) - While Flutter is an elegant cross-platform solution, it uses Dart as its primary language—substantially increasing the barrier to entry.
- [Renative](https://renative.org) - While Renative is a promising cross-platform solution, it is still in its infancy—limiting its stability.

## Synergies
- [Electron](https://www.electronjs.org)
- [Capacitor](https://capacitorjs.com)
- [Vite](https://vitejs.dev)
- [Tauri](https://tauri.app) (TBD)

