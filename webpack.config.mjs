//Ensure html-webpack-plugin is pre-installed via npm.
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'node:path';
import { fileURLToPath } from 'url';

const module = {
	rules: [
		{
			test: /\.html$/,
			use: [{
				loader: 'html-loader',
				options: { minimize: true }
			}]
		},
		{
			test: /\.(WAD|PNG|JSON|ICO)$/i,
			type: 'asset/resource'
		}
	]
};

const plugins = [
	new HtmlWebpackPlugin({
		template: './src/index.html',
		filename: "./index.html"
	}),
	new CopyWebpackPlugin({
		patterns: [
			{from: './src/wads', to: 'wads'},
			{from: './src/favicon.ico', to: 'favicon.ico'},
			{from: './src/wads.json', to: 'wads.json'},
		]
	}),
];

const devServer = {
	static: {
		directory: path.resolve(fileURLToPath(import.meta.url), '../src'),
		publicPath: '/src'
	},
	headers: {
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Opener-Policy': 'same-origin',
	},
};

const output = {
	path: path.resolve(fileURLToPath(import.meta.url), '../docs'), // build to /docs for github pages
	filename: '[name].bundle.js',
	clean: true,
};

const optimization = {
	minimize: false,
};

export default {module, plugins, devServer, output, optimization};
