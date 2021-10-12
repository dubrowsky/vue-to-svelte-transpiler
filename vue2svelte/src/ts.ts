import * as ts from 'typescript'

const compilerOptions = {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ESNext,
  jsx: ts.JsxEmit.Preserve
};

export const getTsAst = (
  src: string,
  path = 'none.ts'
) => ts.createSourceFile(
  path,
  src,
  compilerOptions.target,
  true,
  ts.ScriptKind.TSX
);

export const compileTsSource = (src: string, transformers = {}, asBlock = false) => {
  // prevent incorrect compilation of object literals
  const safeSrc = !asBlock && /^\s*{/s.test(src) ? `(${src})` : src;
  const res = ts.transpileModule(safeSrc, {
    compilerOptions,
    transformers,
  });
  return res.outputText.replace(/\s*;\s*$/, '');
}

export type visitorFn = (n: ts.Node) => void | ts.Node | ts.Node[];

type traverseFn = (n: ts.Node) => void | false;

export const traverseAst = (ast: ts.Node, fn: traverseFn) => {
  const res = fn(ast);
  if (res === false) {
    return;
  }
  ts.forEachChild(ast, (child) => {
    traverseAst(child, fn);
  });
}

export const transformTsSource = (
  src: string,
  visitorFn: visitorFn,
  asBlock = false
) => compileTsSource(
  src,
  {
    before: [
      (ctx: ts.TransformationContext) => {
        const visit = (node: ts.Node): ts.Node | ts.Node[] => {
          const resNode = visitorFn(node);
          if (resNode instanceof Array) {
            return resNode.map(
              (cn) => ts.visitEachChild(cn, visit, ctx),
            );
          }
          return ts.visitEachChild(resNode || node, visit, ctx);
        }
        return (node: ts.Node) => ts.visitNode(node, visit);
      }
    ]
  },
  asBlock
);

export const renameIdentifiers = (
  src: string,
  fn: (from: string, isAccess?: boolean) => string,
  asBlock: boolean = false
) => transformTsSource(
  src,
  (node) => {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.name)
      && ts.isIdentifier(node.expression)
    ) {
      const transformed = fn(node.expression.text, true);
      if (transformed === node.expression.text) {
        return node;
      }
      if (transformed !== '') {
        return ts.createPropertyAccess(
          ts.createIdentifier(transformed),
          node.name
        );
      }
      return node.name;
    }
    if (!ts.isIdentifier(node)) {
      return node;
    }
    const transformed = fn(node.text, false);
    if (transformed === node.text) {
      return node;
    }
    return ts.createIdentifier(transformed);
  },
  asBlock
);

export const getPropNode = (obj: ts.ObjectLiteralExpression, name: string): ts.Node | undefined => {
  for (let i = 0; i < obj.properties.length; i++) {
    const p = obj.properties[i];
    const propName = p.name;
    if (!propName || !ts.isIdentifier(propName) || propName.text !== name) {
      continue;
    }
    if (ts.isPropertyAssignment(p)) {
      return p.initializer;
    }
    return p;
  }
};

export const getJsDoc = (n: ts.Node | undefined): ts.JSDoc | undefined => {
  if (!n) {
    return undefined;
  }
  return ((n as any).jsDoc || [])[0];
}

/**
 * Finds first identifier in property access chain
 * e.g. for expression
 * My.isRequired.oneOf([Types.number, Types.string]).def(42)
 * returns "My" identifier node
 * @param expr
 */
export const findExpressionRootNode = (expr: ts.Node): ts.Identifier | undefined => {
  if (ts.isPropertyAccessExpression(expr)) {
    if (ts.isIdentifier(expr.expression)) {
      return expr.expression;
    } else {
      return findExpressionRootNode(expr.expression);
    }
  }
  if (ts.isCallExpression(expr)) {
    return findExpressionRootNode(expr.expression);
  }
}
