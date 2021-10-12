import {
  TranspilerOptions,
  OutputFile,
  CssModulesOptions,
  RuntimeOptions,
  ScriptInfo,
} from './types';
import { parseSfc } from "./sfc";
import { TemplateProcessor } from "./template/template";
import { ScriptProcessor } from "./script/script";
import { prettierFormatJs, prettierFormatSvelte } from "./prettier";
import { runtime as runtimeSrc } from './script/runtime';

export class Transpiler {
  files: string[]
  resolve: (path: string, ctx: string) => string
  getFileContent: (path: string) => string
  result: OutputFile[]
  cssModules?: CssModulesOptions
  runtimeOptions: RuntimeOptions
  emitAlias: string
  nextTickAlias: string
  refsAlias: string
  elAlias: string
  checkCopy: (path: string) => boolean
  constructor(files: string[], options: TranspilerOptions) {
    const {
      resolve,
      getFileContent,
      cssModules,
      emitAlias,
      nextTickAlias,
      refsAlias,
      elAlias,
      runtime,
      copy
    } = options;
    this.checkCopy = copy || (() => false);
    this.files = files;
    this.resolve = resolve;
    this.getFileContent = getFileContent;
    this.result = [];
    if (cssModules !== false) {
      this.cssModules = Object.assign(
        {
          vueVar: '$style',
          svelteVar: 'style$'
        },
        cssModules === true || cssModules === undefined ? {} : cssModules
      )
    }
    this.emitAlias = emitAlias || 'emit$';
    this.nextTickAlias = nextTickAlias || 'nextTick$';
    this.refsAlias = refsAlias || 'refs$';
    this.elAlias = elAlias || 'el$';
    this.runtimeOptions = Object.assign({
      path: 'v2s-runtime.js',
      alias: './v2s-runtime.js'
    }, runtime || {})
  }

  addOutputFile(f: OutputFile) {
    if (!this.result.some(cf => cf.path === f.path)) {
      this.result.push(f);
    }
  }

  needRuntime = false;
  addRuntime(vars: string[]): string {
    this.needRuntime = true;
    return `import {${vars.join(', ')}} from '${this.runtimeOptions.alias}'`;
  }

  handleFile(path: string) {
    if (!/\.vue$/.test(path) || this.checkCopy(path)) {
      this.addOutputFile({
        sourcePath: path,
        path,
        content: this.getFileContent(path),
      });
      return;
    }
    this.processComponent(path);
  }

  run() {
    for (let i = 0; i < this.files.length; i++) {
      this.handleFile(this.files[i]);
    }
    if (this.needRuntime) {
      this.addOutputFile({
        path: this.runtimeOptions.path,
        content: runtimeSrc,
      });
    }
  }

  processComponent(path: string) {
    const src = this.getFileContent(path);
    const { script, style, template } = parseSfc(src);

    const varMap = this.getVarMap();
    let scriptSrc: string = '';
    let componentNames: string[] = [];
    let scriptProcessor: ScriptProcessor | undefined = undefined;
    const requiredRuntime = [];
    let scriptInfo: ScriptInfo = {};
    try {
      scriptProcessor = new ScriptProcessor(script.content, path, this);
      scriptInfo = scriptProcessor.getInfo();
      componentNames = scriptProcessor.getComponentNames();
    } catch (e) {

    }
    let templateSrc = '';
    let templateVars: string[] = [];
    if (template.content) {
      try {
        const isFunctional = Boolean(template.attrs.functional);
        const templateProcessor = new TemplateProcessor(
          template.content,
          varMap,
          this,
          isFunctional
        );
        templateProcessor.needsElRef = (script.content || '').includes('$el');
        templateSrc = templateProcessor.process(componentNames);
        templateVars = templateProcessor.usedVars;
        if (templateProcessor.needsClassnameRuntime) {
          requiredRuntime.push('makeClassName');
        }
        if (templateProcessor.needsStyleRuntime) {
          requiredRuntime.push('makeStyle');
        }
        if (templateProcessor.needUnwrapEvent) {
          requiredRuntime.push('unwrapEvent');
        }
        if (templateProcessor.rootElRef && scriptProcessor) {
          scriptProcessor.rootElRef = templateProcessor.rootElRef;
        }
      } catch (e) {
        console.log('template error', path);
      }
    }

    try {
      if (scriptProcessor !== undefined) {
        scriptSrc = scriptProcessor.process(templateVars, requiredRuntime);
      }
    } catch (e){
      console.log('script error', path);
      scriptSrc = script.content;
    }

    let res = '';
    let svelteContent;
    if (!scriptInfo.hasJsx) {
      const res = [
        templateSrc,
        scriptSrc && `<script>${ scriptSrc }</script>`,
      ].filter(Boolean).join('\n');
      try {
        svelteContent = prettierFormatSvelte(res);
      } catch (e) {
        console.log('svelte prettier failed', path, e.toString());
        svelteContent = res;
      }
    } else {
      try {
        svelteContent = prettierFormatJs(scriptSrc);
      } catch (e) {
        console.log('js formatter failed', res, e.toString());
        svelteContent = res;
      }
      svelteContent = '<script>\n' + svelteContent + '</script>';
    }
    let cssFile: OutputFile | undefined = undefined;
    if (style.content) {
      if (style.attrs.module) {
        cssFile = {
          sourcePath: path,
          path: path.replace(/\.vue$/, '.pcss'),
          content: style.content,
        }
      } else {
        svelteContent += `\n\n<style>${style.content}</style>`
      }
    }
    this.addOutputFile({
      sourcePath: path,
      path: path.replace(/\.vue$/, '.svelte'),
      content: svelteContent,
    });
    if (cssFile) {
      this.addOutputFile(cssFile)
    }
  }

  getVarMap() {
    const varMap: Record<string, string> = {
      $slots: '$$slots',
      $attrs: '$$restProps',
      $emit: this.emitAlias,
      $nextTick: this.nextTickAlias,
      $refs: this.refsAlias,
      $el: this.elAlias
    };
    if (this.cssModules) {
      varMap[this.cssModules.vueVar] = this.cssModules.svelteVar;
    }
    return varMap;
  }
}
