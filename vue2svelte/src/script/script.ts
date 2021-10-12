import * as ts from 'typescript';
import {
  getTsAst,
  transformTsSource,
  traverseAst,
  getPropNode,
  getJsDoc
} from "../ts";
import {ScriptInfo, TranspilerContext} from "../types";
import { collectProps } from './props';

type FnDef = {
  name: string,
  body: string,
  args: ts.ParameterDeclaration[],
  usedKeys: string[],
  singleExpressionBody?: string
  async: boolean
  jsDoc?: ts.JSDoc
}

type CallableDef = {
  name: string,
  body: string,
  usedKeys: string[]
}

const lifeCycleMap = [
  ['mounted', 'onMount'],
  ['beforeMount', 'onMount'],
  ['beforeUpdate', 'beforeUpdate'],
  ['updated', 'afterUpdate'],
  ['beforeCreated', ''],
  ['created', ''],
  ['beforeDestroy', 'onDestroy'],
  ['destroyed', 'onDestroy'],
  ['unmounted', 'onDestroy'],
];

const vueFunctions = [
  'data',
  ...lifeCycleMap.map(([v]) => v),
].reduce(
  (acc, v) => ({ ...acc, [v]: true}),
  {},
) as Record<string, true>;

export class ScriptProcessor {
  ast: ts.SourceFile;
  varsUsedByTemplate: string[] = [];
  path: string;
  varMap: Record<string, string>
  context: TranspilerContext;
  requiredRuntime: Record<string, true> = {};
  usedVars: Record<string, true> = {};
  exported: ts.ObjectLiteralExpression;
  constructor(
    src: string,
    path: string,
    context: TranspilerContext
  ) {
    this.ast = getTsAst(src);
    this.path = path;
    this.varMap = context.getVarMap();
    this.context = context;
    this.exported = this.getExported();
  }

  getInfo(): ScriptInfo {
    const result = {
      hasEl: false,
      hasJsx: false,
    };
    traverseAst(
      this.ast,
      (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === '$el') {
          result.hasEl = true;
        } else if (ts.isJsxElement(n)) {
          result.hasJsx = true;
        }
      }
    );
    return result;
  }

  getExported(): ts.ObjectLiteralExpression {
    const exportExpr = this.ast.statements.find(ts.isExportAssignment);
    if (!exportExpr) {
      throw new Error('script exports nothing');
    }
    let expr = exportExpr.expression;
    if (ts.isCallExpression(expr)) {
      expr = expr.arguments[0]
    }
    if (!ts.isObjectLiteralExpression(expr)) {
      throw new Error('script export is not object literal');
    }
    return expr;
  }

  getComponentNames(): string[] {
    const components = this.getOptionNode('components');
    if (!components || !ts.isObjectLiteralExpression(components)) {
      return [];
    }
    return components.properties.map(
      (prop) => {
        if (
          ts.isShorthandPropertyAssignment(prop)
          || ts.isPropertyAssignment(prop)
        ) {
          return this.printNode(prop.name);
        }
        return '';
      }
    ).filter(Boolean);
  }

  process(varsUsedByTemplate: string[], requiredRuntime: string[]) {
    this.varsUsedByTemplate = varsUsedByTemplate;
    varsUsedByTemplate.forEach(v => {
      this.usedVars[v] = true;
    })
    requiredRuntime.forEach(
      v => {
        this.requiredRuntime[v] = true;
      }
    );
    let res = '';
    res += this.buildTopLevel() + '\n\n';

    let callables: CallableDef[] = [];
    const data = this.collectData();
    if (data) {
      callables.push(data);
    }
    callables = callables.concat(this.collectMethods());
    callables = callables.concat(this.collectComputed());
    callables = callables.concat(this.collectTopLevelMethods());
    const lifecycle = this.buildLifecycle();
    const watchers = this.buildWatchers();
    const props = this.buildProps();
    res += this.buildImports() + '\n\n';
    if (props) {
      res += props + '\n\n';
    }
    res += this.buildCallables(callables) + '\n\n';
    res += lifecycle + '\n\n';
    res += watchers;
    return res;
  }

  buildCallables(callables: CallableDef[]): string {
    const map: Record<string, CallableDef> = callables.reduce(
      (acc, callable) => ({ ...acc, [callable.name]: callable }),
      {}
    );
    const added: Record<string, true> = {};
    let sortedCallables: string[] = [];
    const add = (name: string, stack: string[] = []) => {
      if (!map[name]) {
        return;
      }
      if (stack.includes(name)) {
        return;
      }
      if (added[name]) {
        return;
      }
      const { usedKeys, body } = map[name];
      const newStack = stack.concat([name]);
      usedKeys.forEach(keyName => add(keyName, newStack));
      sortedCallables.push(body);
      added[name] = true;
    }
    ['data', ...this.varsUsedByTemplate].forEach((tplName) => add(tplName));
    callables.forEach(
      (callable) => {
        if (!added[callable.name]) {
          sortedCallables.push(callable.body);
        }
      }
    )
    return sortedCallables.join('\n\n');
  }

  private getOptionNode(name: string): ts.Node | undefined {
    return getPropNode(this.exported, name);
  }

  buildProps(): string {
    return collectProps(this.getOptionNode('props')).map(
      (p) => {
        let res = '';
        if (p.jsDoc) {
          res += this.printNode(p.jsDoc) + '\n';
        }
        res += `export let ${p.name}`;
        if (p.def) {
          res += ` = ${this.printDefault(p.def)}`;
        }
        res += ';';
        return res;
      }
    ).join('\n\n');
  }

  printDefault(n: ts.Node) {
    const fn = this.transformFunction(n);
    if (fn) {
      return fn.singleExpressionBody || `(() => { ${fn.body} })()`;
    }
    return this.printNode(n);
  }

  printNode(n?: ts.Node) {
    if (!n) {
      return '';
    }
    return n.getText(this.ast);
  }

  vueTypesAlias: string | undefined = undefined;
  moduleContextResult: string[] = [];
  buildTopLevel() {
    return this.ast.statements.map(
      (node) => {
        if (ts.isExportAssignment(node) || ts.isExportDeclaration(node)) {
          return;
        }
        if (ts.isImportDeclaration(node)) {
          const specifier = this.printNode(node.moduleSpecifier).replace(/['"]/g, '');
          if (specifier === 'vue-types') {
            this.vueTypesAlias = this.printNode(node.importClause);
            return;
          }
          if (specifier === 'vue') {
            return;
          }
          if (specifier.match(/\.vue$/)) {
            const newFrom = specifier.replace(/\.vue$/, '.svelte');
            return `import ${this.printNode(node.importClause)} from '${newFrom}'`;
          }
        }
        return this.printNode(node);
      },
    ).filter(Boolean).join('\n');
  }

  collectData(): CallableDef | undefined {
    const dataNode = this.getOptionNode('data');
    if (!dataNode) {
      return;
    }
    const fn = this.transformFunction(dataNode);
    if (!fn) {
      return;
    }
    const ast = getTsAst(fn.body);
    const retNode = ast.statements.find(ts.isReturnStatement);

    if (!retNode) {
      return;
    }
    let retExp = retNode.expression;
    if (retExp && ts.isParenthesizedExpression(retExp)) {
      retExp = retExp.expression
    }
    if (!retExp || !ts.isObjectLiteralExpression(retExp)) {
      console.log('wrong retNode', retExp);
      return;
    }
    const vars: { name: string, value: string }[] = [];
    for (let i = 0; i < retExp.properties.length; i++) {
      const propNode = retExp.properties[i];
      if (!propNode.name) {
        continue;
      }
      const name = propNode.name.getText(ast)
      let value = '';
      if (ts.isPropertyAssignment(propNode)) {
        value = propNode.initializer.getFullText(ast);
      } else if (ts.isShorthandPropertyAssignment(propNode)) {
        value = name;
      }
      vars.push({name, value});
    }
    let body = '';
    if (fn.singleExpressionBody) {
      body = vars.map(
        v => `let ${v.name} = ${v.value}`
      ).join('\n');
    } else {
      const keys = vars.map(v => v.name).join(', ');
      body = `let {${keys}} = (() => {${fn.body}})()`;
    }
    return { body, usedKeys: fn.usedKeys, name: 'data' };
  }

  collectFunctions(from: string): FnDef[] {
    const methodsNode = this.getOptionNode(from);
    const res: FnDef[] = [];
    if (!methodsNode) {
      return res;
    }
    if (!ts.isObjectLiteralExpression(methodsNode)) {
      return res;
    }

    methodsNode.properties.forEach(
      (comp) => {
        const fn = this.transformFunction(comp);
        if (fn) {
          res.push(fn);
        }
      }
    )
    return res;
  }

  printFunction(fn: FnDef): string {
    const args = fn.args.map(a => this.printNode(a.type ? a.name : a)).join(',');
    const asyncMod = fn.async ? 'async ' : '';
    let isSingleArg = fn.args.length === 1;
    if (isSingleArg) {
      const arg = fn.args[0];
      isSingleArg = ts.isIdentifier(arg.name) && !arg.initializer;
    }
    let singleExp = (fn.singleExpressionBody || '').trim();
    if (singleExp && singleExp[0] === '{') {
      singleExp = `(${singleExp})`;
    }
    return `${
      !asyncMod && isSingleArg ? args : `${asyncMod}(${args})`
    } => ${singleExp || `{${fn.body}}`}`;
  }

  collectMethods(): CallableDef[] {
    const methods = this.collectFunctions('methods');
    return methods.map(m => ({
      name: m.name,
      body: `${m.jsDoc ? this.printNode(m.jsDoc) + '\n' : ''}const ${m.name} = ${this.printFunction(m)}`,
      usedKeys: m.usedKeys,
    }));
  }

  collectTopLevelMethods(): CallableDef[] {
    const res: FnDef[] = [];
    this.exported.properties.forEach(
      (comp) => {
        const fn = this.transformFunction(comp);
        if (fn && !vueFunctions[fn.name]) {
          res.push(fn);
        }
      }
    );
    return res.map(m => ({
      name: m.name,
      body: `${m.jsDoc ? this.printNode(m.jsDoc) + '\n' : ''}const ${m.name} = ${this.printFunction(m)}`,
      usedKeys: m.usedKeys,
    }));
  }

  transformFunction(node?: ts.Node): FnDef | undefined {
    if (!node) {
      return undefined;
    }
    const res: FnDef = {
      name: '',
      body: '',
      usedKeys: [],
      args: [],
      async: false,
      jsDoc: getJsDoc(node)
    };

    let methodBody: string;
    const extractFromBlock = (n: { body?: ts.Node }) => {
      if (n.body && ts.isBlock(n.body)) {
        return n.body.statements.map(cn => this.printNode(cn)).join('\n');
      }
      return '';
    }
    if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
      res.name = this.printNode(node.name).trim();
      methodBody = extractFromBlock(node);
    } else if (ts.isArrowFunction(node)) {
      methodBody = extractFromBlock(node) || `return ${this.printNode(node.body)}`;
    } else {
      return;
    }
    res.async = (node.modifiers || []).some(
      m => m.kind === ts.SyntaxKind.AsyncKeyword,
    );
    res.args = [...node.parameters];
    const usedKeysMap: Record<string, true> = {};
    const useKey = (key: string) => {
      if (!usedKeysMap[key]) {
        res.usedKeys.push(key);
        usedKeysMap[key] = true;
        this.usedVars[key] = true;
      }
    }
    res.body = transformTsSource(
      methodBody,
      (n) => {
        // this.foo => foo
        if (
          ts.isPropertyAccessExpression(n)
          && n.expression
          && n.expression.kind === ts.SyntaxKind.ThisKeyword
        ) {
          useKey(n.name.text);
          if (this.varMap[n.name.text]) {
            return ts.createIdentifier(this.varMap[n.name.text]);
          }
          return n.name;
        }
        // const { foo } = this => [empty]
        // const { foo: bar } = this => const bar = foo;
        if (ts.isVariableStatement(n)) {
          for (let i = 0; i < n.declarationList.declarations.length; i++) {
            const d = n.declarationList.declarations[i];
            if (
              d.initializer
              && d.initializer.kind === ts.SyntaxKind.ThisKeyword
              && ts.isObjectBindingPattern(d.name)
            ) {
              const aliases: [string, string][] = [];
              d.name.elements.forEach(
                el => {
                  const { name, propertyName } = el;
                  const nameText = name.getText();
                  const extractedName = propertyName ? propertyName.getText() : nameText;
                  if (this.varMap[extractedName]) {
                    aliases.push([nameText, this.varMap[extractedName]]);
                  } else if (propertyName) {
                    aliases.push([nameText, extractedName])
                  }
                  useKey(extractedName);
                }
              );
              return aliases.map(
                ([name, source]) => ts.createVariableStatement(
                  undefined,
                  ts.createVariableDeclarationList(
                    [ts.createVariableDeclaration(
                      ts.createIdentifier(name),
                      undefined,
                      ts.createIdentifier(source)
                    )],
                    ts.NodeFlags.Const
                  )
                )
              );
            }
          }``
        }
        return n;
      }
    );
    const resAst = getTsAst(res.body);
    const retSt = resAst.statements[0];
    if (resAst.statements.length === 1 && ts.isReturnStatement(retSt) && retSt.expression) {
      res.singleExpressionBody = retSt.expression.getFullText(resAst);
    }
    return res;
  }

  collectComputed(): CallableDef[] {
    return this.collectFunctions('computed').map(
      (fn) => {
        let body = '';
        if (fn.jsDoc) {
          body += this.printNode(fn.jsDoc) + '\n';
        }
        body += `$: ${fn.name} = `;
        if (fn.singleExpressionBody) {
          body += fn.singleExpressionBody;
        } else {
          body += '(() => {\n' + fn.body + '\n})();'
        }
        return { body, usedKeys: fn.usedKeys, name: fn.name };
      }
    );
  }

  rootElRef: string | undefined = undefined;
  svelteImports: Record<string, true> = {};
  buildImports() {
    const allVars = this.usedVars;
    const res: string[] = [];
    if (this.context.cssModules) {
      const { svelteVar, vueVar } = this.context.cssModules;
      if (allVars[vueVar]) {
        const fileName = this.path.match(/[^/]+$/);
        if (fileName) {
          const styleName = fileName[0].replace(/\..*$/, '') + '.pcss';
          res.push(`import ${svelteVar} from './${styleName}'`);
        }
      }
    }
    let { requiredRuntime } = this;
    if (allVars.$nextTick) {
      const alias = this.context.nextTickAlias;
      const name = 'nextTick$';
      this.requiredRuntime[`${name}${alias === name ? '' : `as ${alias}`}`] = true;
    }
    const requiredRuntimeKeys = Object.keys(requiredRuntime);
    if (requiredRuntimeKeys.length) {
      res.push(this.context.addRuntime(requiredRuntimeKeys));
    }
    const svelteImports = this.svelteImports;
    if (allVars.$emit) {
      svelteImports.createEventDispatcher = true;
      res.push(`const ${this.context.emitAlias} = createEventDispatcher();`);
    }
    const svelteImportKeys = Object.keys(svelteImports);
    if (svelteImportKeys.length) {
      res.unshift(`import {${svelteImportKeys.join(', ')}} from 'svelte';`);
    }
    const { elAlias, refsAlias } = this.context;
    if (allVars.$refs) {
      res.push(`let ${refsAlias} = {}`);
    }
    if (allVars.$el) {
      res.push(`let ${elAlias};`);
      if (this.rootElRef) {
        res.push(`$: ${elAlias} = ${refsAlias}[${this.rootElRef}];`);
      }
    }
    return res.join('\n\n');
  }

  buildLifecycle(): string {
    const res: string[] = [];
    lifeCycleMap.forEach(
      ([vueName, svelteName]) => {
        const fn = this.transformFunction(this.getOptionNode(vueName));
        if (!fn) {
          return;
        }
        const doc = this.printNode(fn.jsDoc) || `// ${vueName}`;
        const body = `${svelteName}(${this.printFunction(fn)})${svelteName ? '' : '()'};`;
        if (svelteName) {
          this.svelteImports[svelteName] = true;
        }
        res.push([doc, body].join('\n'));
      }
    );
    return res.join('\n\n');
  }

  buildWatchers() {
    const node = this.getOptionNode('watch');
    if (!node || !ts.isObjectLiteralExpression(node)) {
      return '';
    }
    const watchers: { name: string, fn: FnDef, immediate: boolean }[] = [];
    node.properties.forEach(
      (prop) => {
        if (!prop.name) {
          return;
        }
        const name = this.printNode(prop.name).trim();
        if (ts.isMethodDeclaration(prop)) {
          const fn = this.transformFunction(prop);
          if (fn) {
            watchers.push({name, fn, immediate: false});
          }
          return;
        }
        if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
          const handler = getPropNode(prop.initializer, 'handler');
          const immediate = getPropNode(prop.initializer, 'immediate');
          const fn = this.transformFunction(handler);
          if (fn) {
            watchers.push({
              name,
              fn,
              immediate: !!immediate && immediate.kind === ts.SyntaxKind.TrueKeyword,
            })
          }
        }
      }
    );
    let res: string[] = [];
    watchers.forEach(
      (watcher) => {
        const needsWrapper = !watcher.immediate || watcher.fn.args.length > 1;
        const watcherProp = `${watcher.name}Watcher`;
        if (needsWrapper) {
          const makeWatcherArgs = [
            watcher.name,
            this.printFunction(watcher.fn),
            watcher.immediate ? 'true' : ''
          ].filter(Boolean).join(', ');
          res.push(
            `const ${watcherProp} = makeWatcher(${makeWatcherArgs})` + '\n' +
            `$: ${watcherProp}(${watcher.name})`
          );
          this.requiredRuntime.makeWatcher = true;
        } else {
          res.push(
            `const ${watcherProp} = ${this.printFunction(watcher.fn)};` + '\n' +
            `$: ${watcherProp}(${watcher.name})`
          );
        }
      }
    )
    return res.join('\n\n');
  }
}
