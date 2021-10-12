import {compile, ASTElement, ASTExpression, ASTText, ASTNode} from 'vue-template-compiler';
import * as ts from 'typescript'
import { getTsAst, renameIdentifiers, traverseAst } from '../ts';
import {
  isUnaryTag,
  VUE_NODE_TYPE,
  extractVarsFromForAlias,
  unprefix
} from "./helpers";
import { TranspilerContext } from "../types";

export class TemplateProcessor {

  ast: ASTElement;
  varMap: Record<string, string>;
  usedVars: string[];
  usedVarsMap: Record<string, true>
  localScopes: Record<string, true>[];
  context: TranspilerContext
  isFunctional: boolean;
  needsElRef: boolean = false;
  constructor(
    src: string,
    varMap: Record<string, string>,
    context: TranspilerContext,
    isFunctional: boolean
  ) {
    const ast = compile(src).ast;
    if (!ast) {
      throw new Error('Failed to compile vue template\n\n' + src);
    }
    this.ast = ast;
    this.varMap = varMap;
    this.usedVarsMap = {};
    this.usedVars = [];
    this.localScopes = [];
    this.context = context;
    this.isFunctional = isFunctional;
  }

  pushScope(vars: string[]) {
    this.localScopes.push(
      vars.reduce((acc, v) => ({...acc, [v]:true }), {}),
    );
  }

  popScope() {
    this.localScopes.pop();
  }

  useVar(varName: string) {
    for (let i = 0; i < this.localScopes.length; i++) {
      if (this.localScopes[i][varName]) {
        return;
      }
    }
    if (!this.usedVarsMap[varName]) {
      this.usedVars.push(varName);
      this.usedVarsMap[varName] = true;
    }
  }

  componentNamesMap: Record<string, true> = {}
  isRootNode: boolean = true;
  process(componentNames: string[]): string {
    this.componentNamesMap = componentNames.reduce(
      (acc, c) => ({ ...acc, [c]: true }),
      {},
    );
    return this.processNode(this.ast);
  }

  handleForScope(node: ASTElement): boolean {
    if (!node.for) {
      return false;
    }
    this.pushScope([
      ...extractVarsFromForAlias(node.alias || ''),
      node.iterator1 || ''
    ].filter(Boolean));
    return true;
  }

  prepareEventName(e: string): string {
    const parts = e.split('.');
    const baseName = parts[0];
    const map = {
      prevent: 'preventDefault',
      stop: 'stopPropagation',
      capture: 'capture',
      passive: 'passive',
      self: 'self',
      once: 'once',
    } as Record<string, string>;
    const modifiers = parts.slice(1).map(m => map[m] || '').filter(Boolean);
    return [baseName].concat(modifiers).join('|');
  }

  rootElRef: string | undefined = undefined;
  processAttribute(attr: string, value: string, tag: string): string {
    const eventName = unprefix(attr, '@') || unprefix(attr, 'v-on:');
    if (typeof eventName === 'string') {
      let res = ` on:${this.prepareEventName(eventName)}`;
      if (value) {
        res += `={${this.prepareEventExpression(this.prepareExpression(value), tag)}} `
      }
      return res;
    }
    const boundName = unprefix(attr, ':') || unprefix(attr, 'v-bind:');
    if (!boundName && attr.slice(0, 2) === 'v-') {
      return '';
    }
    const isRoot = this.isRootNode;
    let realName = boundName || attr;
    if (realName === 'key') {
      return '';
    }
    const isClass = realName === 'class';
    const isStyle = realName === 'style';
    const isSpecial = isClass || isStyle;
    const specialTail = isRoot && isSpecial ? ` + ($$restProps.${realName} || '')` : '';
    if (tag === 'svelte:component' && realName === 'is') {
      realName = 'this';
    }
    if (realName === 'ref') {
      realName = 'bind:this';
      this.useVar('$refs');
    }
    if (boundName) {
      let preparedValue = '';
      if (boundName === 'ref') {
        const refExpr = this.prepareExpression(value);
        preparedValue = `${this.context.refsAlias}[${refExpr}]`;
        if (isRoot) {
          this.rootElRef = refExpr;
        }
      } else if (isClass) {
        preparedValue = this.prepareClassExpression(value) + (specialTail ? `+ ' '${specialTail}` : '');
      } else if (isStyle) {
        preparedValue = this.prepareStyleExpression(value) + (specialTail ? `+ ' '${specialTail}` : '');
      } else {
        preparedValue = this.prepareExpression(value);
      }
      return ` ${realName}={${preparedValue}} `;
    }
    if (attr === 'ref') {
      if (isRoot) {
        this.rootElRef = `'${value}'`;
      }
      return `${realName}={${this.context.refsAlias}.${value}}`;
    }
    if (isRoot && isSpecial) {
      return `${realName}={'${value}${isStyle ? ';' : ''} '${specialTail}}`;
    }
    return `${realName}="${value}"`
  }

  processVModel(expr: string, tag: string, attrs: Record<string, string>): string {
    if (tag === 'input') {
      const type = attrs.type;
      let bound = ({
        checkbox: 'checked',
        radio: 'group'
      } as Record<string, string>)[type] || 'value';
      return ` bind:${bound}={${expr}}`;
    } else if (tag === 'select' || tag === 'textarea') {
      return ` bind:value={${expr}}`;
    }
    return '';
  }

  needsClassnameRuntime: boolean = false;
  needsStyleRuntime: boolean = false;
  prepareClassExpression(value: string) {
    const rawExpr = this.prepareExpression(value);
    const ast = getTsAst(rawExpr);
    const statement = ast.statements[0];
    if (statement && ts.isExpressionStatement(statement)) {
      const expr = statement.expression;
      if (
        ts.isPropertyAccessExpression(expr)
        && expr.expression.getText(ast) === this.context.cssModules?.svelteVar
      ) {
        return rawExpr;
      }
    }
    this.needsClassnameRuntime = true;
    return `makeClassName(${rawExpr})`;
  }

  prepareStyleExpression(value: string) {
    this.needsStyleRuntime = true;
    return `makeStyle(${this.prepareExpression(value)})`;
  }

  processElement(node: ASTElement) {
    if (node.ifConditions) {
      return this.processConditional(node);
    }
    const hasScope = this.handleForScope(node);
    let { tag } = node;
    if (tag === 'component') {
      tag = 'svelte:component';
    }
    let openTag = '';
    let closeTag = `</${tag}>`;
    if (tag === 'template') {
      tag = '';
      closeTag = '';
    }
    const { attrsMap } = node;
    if (tag) {
      openTag = `<${tag} `;
      const attrs = Object.entries(attrsMap).map(
        ([k, v]) => this.processAttribute(k, v, tag),
      );
      if (this.isRootNode) {
        const hasAttr = (a: string) => attrsMap[a] || attrsMap[`:${a}`] || attrsMap[`v-bind:${a}`];
        if (!hasAttr('class')) {
          attrs.push('class={$$restProps.class}');
        }
        if (!hasAttr('style')) {
          attrs.push('style={$$restProps.style}');
        }
        if (!hasAttr('ref') && this.needsElRef) {
          attrs.push(`bind:this={${this.context.elAlias}}`);
        }
      }
      openTag += attrs.join(' ');
    }
    const vModel = attrsMap['v-model'];
    if (vModel) {
      openTag += this.processVModel(
        vModel,
        tag,
        attrsMap
      );
    }
    const vBind = attrsMap['v-bind'];
    if (vBind) {
      openTag += ` { ...(${this.prepareExpression(vBind)}) }`
    }
    const vHtml = attrsMap['v-html'];
    if (isUnaryTag[tag]) {
      openTag += ' />';
      closeTag = '';
    } else if (tag) {
      openTag += '>';
      if (vHtml) {
        openTag += `{@html ${this.prepareExpression(vHtml)}}`
      }
    }
    let res = openTag;
    if (!vHtml) {
      const wasRootNode = this.isRootNode;
      this.isRootNode = false;
      node.children.forEach(
        (child) => {
          res += this.processNode(child);
        }
      );
      this.isRootNode = wasRootNode;
    }
    res += closeTag;
    if (hasScope) {
      this.popScope();
    }
    if (node.for) {
      res = this.wrapWithFor(node, res);
    }
    return res;
  }

  processConditional(node: ASTElement): string {
    const conditions = node.ifConditions || [];
    return conditions.reduce(
      (res, {exp, block}, i) => {
        const isFirst = i === 0;
        const isLast = i === conditions.length - 1;
        const cond = exp ? `if ${this.prepareExpression(exp)}` : '';
        let openTag = `\n{${isFirst ? '#' : `:else `}${cond}}\n`;
        return [
          res,
          openTag,
          this.processNode({ ...block, ifConditions: undefined }),
          isLast && '\n{/if}'
        ].filter(v => v).join('');
      },
      '',
    )
  }

  wrapWithFor(node: ASTElement, res: string) {
    const { for: source = '', alias, iterator1 = '' } = node;
    const key = node.attrsMap[':key'];
    const keyString = key ? ` (${key})` : '';
    const expr = this.prepareExpression(source);
    return `
    {#each ${expr} as ${alias}${ iterator1 ? ', ' : ''}${iterator1}${keyString}}
      ${res}
    {/each}`;
  }

  processExpression(node: ASTExpression) {
    let res = '';
    node.tokens.forEach(
      (t) => {
        if (typeof t === 'string') {
          res += t;
        } else {
          const b = t['@binding'];
          if (b) {
            res += `{ ${ this.prepareExpression(b) } }`;
          }
        }
      }
    )
    return res;
  }


  prepareExpression(expr: string) {
    return renameIdentifiers(
      expr,
      (id, isAccess) => {
        this.useVar(id);
        if (this.isFunctional) {
          if (id === 'props') {
            return isAccess ? '' : '$$props';
          }
          if (id === '$options') {
            return '';
          }
        }
        return this.varMap[id] || id;
      }
    );
  }

  needUnwrapEvent = false;
  prepareEventExpression(expr: string, tag: string) {
    const isCom = this.componentNamesMap[tag];
    const isFunctionName = /^[a-z0-9$_.]+$/i.test(expr);
    if (isFunctionName) {
      this.useVar(expr)
      if (!isCom) {
        return expr;
      }
      this.needUnwrapEvent = true;
      return `e => ${expr}(unwrapEvent(e))`;
    }
    const ast = getTsAst(expr);
    const firstExpression = ast.statements[0];
    if (ast.statements.length === 1 && ts.isExpressionStatement(firstExpression)) {
      const func = firstExpression.expression;
      if (ts.isArrowFunction(func)) {
        const firstArg = func.parameters[0];
        if (!firstArg) {
          return expr;
        }
        const firstArgName = firstArg.name.getText(ast);
        let res = `(${func.parameters.map(arg => arg.getText(ast))}) => `;
        res += renameIdentifiers(
          func.body.getText(),
          (id) => {
            if (id === firstArgName) {
              this.needUnwrapEvent = true;
              return `unwrapEvent(${id})`;
            }
            return id;
          },
          true
        );
        return res;
      }
    }
    let hasEvent = false;
    const resExpr = renameIdentifiers(
      expr,
      (id) => {
        if (id === '$event') {
          hasEvent = true;
          return 'unwrapEvent($event)';
        }
        return id;
      }
    );
    if (hasEvent) {
      this.needUnwrapEvent = true;
    }
    return `(${hasEvent ? '$event' : ''}) => ${resExpr}`;
  }

  processText(node: ASTText) {
    return node.text;
  }

  processNode(node: ASTNode) {
    switch (node.type) {
      case VUE_NODE_TYPE.ELEMENT:
        return this.processElement(node as ASTElement);
      case VUE_NODE_TYPE.EXPRESSION:
        return this.processExpression(node as ASTExpression);
      case VUE_NODE_TYPE.TEXT:
        return this.processText(node as ASTText);
    }
    return '';
  }

}
