import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import banner from 'rollup-plugin-banner';
const { version, author, license } = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

const toastmarkRoot = path.resolve('../libs/toastmark');
const toastmarkSrc = path.join(toastmarkRoot, 'src');

function localToastmarkSource() {
  return {
    name: 'localToastmarkSource',
    resolveId(source) {
      if (source === '@toast-ui/toastmark') {
        return path.join(toastmarkSrc, 'index.ts');
      }

      return null;
    },
  };
}

function transpileToastmarkSource() {
  return {
    name: 'transpileToastmarkSource',
    transform(code, id) {
      const normalizedId = path.normalize(id);

      if (!normalizedId.startsWith(toastmarkSrc) || !normalizedId.endsWith('.ts')) {
        return null;
      }

      return {
        code: ts.transpileModule(code, {
          compilerOptions: {
            allowJs: true,
            esModuleInterop: true,
            importHelpers: true,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2015,
          },
        }).outputText,
        map: null,
      };
    },
  };
}

function nodeResolvePlugin() {
  return nodeResolve({
    extensions: ['.mjs', '.js', '.json', '.node', '.ts'],
  });
}

function i18nEditorImportPath() {
  return {
    name: 'i18nEditorImportPath',
    transform(code) {
      return code.replace('../editorCore', '@caryhu/tui.editor');
    },
  };
}

const fileNames = fs.readdirSync('./src/i18n');

function createBannerPlugin(type) {
  return banner.default(
    [
      `@caryhu/tui.editor${type ? ` : ${type}` : ''}`,
      `@version ${version} | ${new Date().toDateString()}`,
      `@author ${author}`,
      `@license ${license}`,
    ].join('\n'),
  );
}

export default [
  // editor
  {
    input: 'src/esm/index.ts',
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: false,
    },
    plugins: [
      localToastmarkSource(),
      transpileToastmarkSource(),
      typescript(),
      commonjs(),
      nodeResolvePlugin(),
      createBannerPlugin(),
    ],
    external: [/^prosemirror/],
  },
  // viewer
  {
    input: 'src/esm/indexViewer.ts',
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: false,
    },
    plugins: [
      localToastmarkSource(),
      transpileToastmarkSource(),
      typescript(),
      commonjs(),
      nodeResolvePlugin(),
      createBannerPlugin('viewer'),
    ],
    external: [/^prosemirror/],
  },
  // i18n
  {
    input: fileNames.map((fileName) => `src/i18n/${fileName}`),
    output: {
      dir: 'dist/esm/i18n',
      format: 'es',
      sourcemap: false,
    },
    external: ['@caryhu/tui.editor'],
    plugins: [
      localToastmarkSource(),
      transpileToastmarkSource(),
      typescript(),
      commonjs(),
      nodeResolvePlugin(),
      i18nEditorImportPath(),
      createBannerPlugin('i18n'),
    ],
  },
];
