const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const stub = path.resolve(__dirname, 'fs-shim.js');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

const mode = process.env.NODE_ENV || 'development';
const prod = mode === 'production';

module.exports = {
    entry: {
        bundle: ['./src/main.js']
    },
    resolve: {
        alias: {
            module: stub,
            fs: stub,
            svelte: path.resolve('node_modules', 'svelte'),
            '@': path.resolve(__dirname, './src')
        },
        extensions: ['.js', '.svelte', '.ts'],
        mainFields: ['svelte', 'browser', 'module', 'main']
    },
    output: {
        path: __dirname + '/dist/public',
        filename: '[name].js',
        chunkFilename: '[name].[id].js'
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /(node_modules|bower_components)/,
                use: {
                    loader: 'ts-loader',
                },
            },
            {
                test: /\.pcss$/i,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: { modules: true },
                    },
                ],
            },
            {
                test: /\.css$/i,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.svelte$/,
                use: {
                    loader: 'svelte-loader',
                    options: {
                        emitCss: true,
                        hotReload: true
                    }
                }
            },
            {
                test: /\.ttf$/,
                use: ['file-loader']
            }
        ]
    },
    mode,
    plugins: [
      /*
        new MiniCssExtractPlugin({
            filename: '[name].css'
        })
       */
        new MonacoWebpackPlugin({
            languages: ['css'],
            // languages: ['javascript', 'css', 'html', 'typescript', 'vue']
        })
    ],
    devtool: prod ? false: 'source-map',
    devServer: {
        historyApiFallback: {
            disableDotRule: true
        },
        port: 8081
        // stats: 'errors-only'
    },
    // stats: 'errors-only'
};
