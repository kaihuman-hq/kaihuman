const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The repo's ESM convention imports TS sources as `./x.js`; Metro only knows real
// extensions, so drop `.js` from relative specifiers and let it probe .ts/.tsx.
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = /^\.{1,2}\/.*\.js$/.test(moduleName) ? moduleName.slice(0, -3) : moduleName;
  return upstream
    ? upstream(context, name, platform)
    : context.resolveRequest(context, name, platform);
};

module.exports = config;
