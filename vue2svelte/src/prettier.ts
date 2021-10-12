const prettier = require("prettier/standalone");
const tsParser = require('prettier/parser-typescript');
const babylonParser = require('prettier/parser-babylon');
const cssParser = require('prettier/parser-postcss');
const sveltePlugin = require('prettier-plugin-svelte');

const runPrettier = (src: string, options: any): string => {
  // prettier writes errors into console instead of throwing them
  // so we use temporary monkey patching
  const originalConsoleError = console.error;
  console.error = (e: Error) => {
    throw e;
  };
  const res = prettier.format(src, options);
  console.error = originalConsoleError;
  return res;
}

export const prettierFormatSvelte = (src: string) => runPrettier(
  src,
  {
    parser: 'svelte',
    plugins: [
      babylonParser,
      tsParser,
      cssParser,
      sveltePlugin
    ],
    svelteStrictMode: false,
    svelteIndentScriptAndStyle: false,
    svelteSortOrder: 'markup-scripts-styles',
    htmlWhitespaceSensitivity: 'ignore',
    printWidth: 50
  },
);

export const prettierFormatJs = (src: string) => runPrettier(
  src,
  {
    parser: 'typescript',
    plugins: [
      tsParser,
    ]
  },
);
