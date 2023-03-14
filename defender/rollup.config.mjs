import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import builtins from 'builtin-modules';
import typescript from '@rollup/plugin-typescript';
import path from 'path';
import { URL } from 'url';

const __dirname = new URL('.', import.meta.url).pathname;

/**
 * @type {import('rollup').RollupOptions}
 */
const config = [
  {
    input: path.resolve(__dirname, 'autotasks/execute/execute.ts'),
    output: {
      file: path.resolve(__dirname, 'autotasks/execute/dist/index.js'),
      format: 'cjs',
    },
    plugins: [typescript(), resolve({ preferBuiltins: true }), commonjs(), json({ compact: true })],
    external: [...builtins, 'ethers', 'web3', 'axios', /^defender-relay-client(\/.*)?$/],
  },
];

export default config;
