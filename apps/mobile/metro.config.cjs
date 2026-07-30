const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const normalized = moduleName.replaceAll('\\', '/');
  if (
    process.env.NODE_ENV === 'production' &&
    normalized.endsWith('/learning-demo/registry')
  ) {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, 'src/learning-demo/registry.production.ts'),
      platform,
    );
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
