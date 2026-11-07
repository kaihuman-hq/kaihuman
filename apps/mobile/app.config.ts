import type { ConfigContext, ExpoConfig } from 'expo/config';
import { easAppExtensions } from './plugins/with-kaihuman-widgets.ts';

// app.json holds the static config; this adds what must be derived from `ios.bundleIdentifier`
// so changing the bundle id there is the only edit needed.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      build: {
        experimental: {
          ios: { appExtensions: easAppExtensions(config.ios?.bundleIdentifier) },
        },
      },
    },
  },
});
