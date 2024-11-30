# Web
Web builds are the default build target. These builds are intended to be deployed to a web server, and are accessible from any device with a web browser.

## PWA
Progressive Web Apps (PWAs) are web applications that can be installed on a device and accessed from the home screen. PWAs are supported on most modern browsers, and can be installed on both desktop and mobile devices—though they will have limited access to native features.

Commoners relies on [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) to generate the necessary files for a PWA. To enable this feature, simply add the `--target pwa` flag to your build command.
