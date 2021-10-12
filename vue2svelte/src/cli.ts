import { Transpiler } from "./index";

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from "path";
import * as process from "process";
import {urlToRequire} from "@vue/component-compiler-utils/dist/templateCompilerModules/utils";

const args = require('yargs')(process.argv.slice(2))
  .option('config', { describe: 'path to config file'} )
  .option('source', { describe: 'source dir (with vue files)'} )
  .option('target', { describe: 'target dir (for svelte files)'} )
  .option('ignore', { describe: 'regex to ignore'})
  .help()
  .argv


const config = {
  source: args.source,
  target: args.target,
  ignore: args.ignore,
} as Record<string, any>;

if (args.config) {
  const configFileData = require(path.resolve(args.config));
  const configDir = path.dirname(path.resolve(args.config));
  ['source', 'target'].forEach(
    (prop) => {
      if (configFileData[prop] && !args[prop]) {
        config[prop] = path.resolve(configDir, configFileData[prop]);
      }
    }
  );
  if (configFileData.ignore && !config.ignore) {
    config.ignore = configFileData.ignore;
  }
  if (configFileData.copy) {
    config.copy = configFileData.copy;
  }
}



console.log(config)

const src = config.source;
const dst = config.target;

const ignoreArg = config.ignore;

let ignore: (f: string) => boolean = (f) => false;

if (ignoreArg) {
  if (typeof ignoreArg === 'string') {
    const ignoreRex = new RegExp(ignoreArg.split('=')[1]);
    ignore = f => ignoreRex.test(f);
  } else {
    ignore = ignoreArg
  }
}

const collectFiles = (dir: string): string[] => {
  let res: string[] = [];
  const entries = readdirSync(dir);
  const getPath = (f: string) => dir.replace(/\/$/, '') + '/' + f;
  entries.forEach(
    (file) => {
      const cPath = getPath(file);
      if (ignore(cPath)) {
        console.log('ignore', cPath)
        return;
      }
      if (statSync(cPath).isDirectory()) {
        res = res.concat(collectFiles(cPath));
      } else {
        res.push(cPath);
      }
    }
  )
  return res;
}

const writeFile = (path: string, content: string) => {
  const dir = path.replace(/\/[^/]+$/, '');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, content);
}

const transpiler = new Transpiler(
  collectFiles(src),
  {
    getFileContent: (path) => readFileSync(path, 'utf8'),
    resolve: (path) => path,
    copy: config.copy,
    runtime: {
      path: src + '/v2s-runtime.js',
      alias: '@/v2s-runtime'
    }
  }
);


transpiler.run();

transpiler.result.forEach(
  (f) => {
    const dest = dst + f.path.slice(src.length);
    if (f.content) {
      writeFile(dest, f.content);
      console.log('write', dest)
    }
  }
)
