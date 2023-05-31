import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.commoners.app',
  appName: 'COMMONERS',
  webDir: 'out/renderer',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  }
};

export default config;
