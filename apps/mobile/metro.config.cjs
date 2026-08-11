const { getDefaultConfig } = require('expo/metro-config');

// SDK 57 includes pnpm monorepo support in the default Expo Metro config.
// Keep this intentionally minimal until a failing diagnostic proves a custom
// resolver setting is required.
module.exports = getDefaultConfig(__dirname);
