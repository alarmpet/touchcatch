const path = require('node:path');

// Expo Router's Babel plugin reads this during entry transformation. Set it
// before the preset is created so monorepo cwd detection cannot select root/app.
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(__dirname, 'app');

module.exports = function babelConfig(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
