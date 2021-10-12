const path = require('path');
const stub = path.resolve(__dirname, 'fs-shim.js');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
  configureWebpack: {
    resolve: {
      alias: {
        'fs': stub,
        'module': stub
      }
    },
    plugins: [
      new MonacoWebpackPlugin({
        languages: ['css'],
      })
    ],
  },
}
