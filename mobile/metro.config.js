const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Les illustrations sont conservées avec les données initiales du projet.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../data/recipes/images')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
