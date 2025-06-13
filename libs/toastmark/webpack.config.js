/* eslint-disable @typescript-eslint/no-var-requires */
import { resolve as _resolve } from 'path';
import { merge } from 'webpack-merge';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';

const __dirname = _resolve();
const commonConfig = {
  entry: _resolve(__dirname, './src/index.ts'),
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    environment: {
      arrowFunction: false,
      const: false,
    },
    filename: 'toastmark.js',
    library: {
      type: 'commonjs',
    },
    publicPath: '/dist',
    path: _resolve(__dirname, 'dist'),
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        extractComments: false,
      }),
    ],
  },
};

export default (env) => {
  const isProduction = env.WEBPACK_BUILD;

  if (isProduction) {
    return commonConfig;
  }

  return merge(commonConfig, {
    entry: _resolve(__dirname, './src/__sample__/index.ts'),
    mode: 'development',
    devtool: 'inline-source-map',
    output: {
      library: {
        type: 'umd',
      },
      publicPath: '/',
      path: _resolve(__dirname, '/'),
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'index.html',
      }),
    ],
    devServer: {
      open: true,
      inline: true,
      host: '0.0.0.0',
      port: 8000,
      disableHostCheck: true,
    },
  });
};
