import { CapacitorConfig } from '@capacitor/cli';

import commonersConfig from './commoners.config';

const config: CapacitorConfig = {
  appId: commonersConfig.appId,
  appName: commonersConfig.name,
  webDir: commonersConfig.ourDir,
  bundledWebRuntime: false,
};

export default config;