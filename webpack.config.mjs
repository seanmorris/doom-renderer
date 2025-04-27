//Ensure html-webpack-plugin is pre-installed via npm.
import HtmlWebpackPlugin from 'html-webpack-plugin';
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
			test: /\.WAD$/i,
			use: [{
				loader: 'arraybuffer-loader',
			}],
		},
	]
};

const plugins = [
	new HtmlWebpackPlugin({
		template: './src/index.html',
		filename: "./index.html"
	}),
];

const devServer = {
	static: {
		directory: path.resolve(fileURLToPath(import.meta.url), './src'),
		publicPath: '/src'
	}
};

export default {module, plugins, devServer};