import * as ts from 'typescript';
import { getPropNode, getJsDoc, findExpressionRootNode, traverseAst } from "../ts";

export type PropDef = {
  name: string
  type?: string
  def?: ts.Node
  jsDoc?: ts.JSDoc
  usedVars?: string[],
  isRequired?: boolean
}

const ctorToTsType = {
  String: 'string',
  Array: '[]',
  Number: 'number',
  Boolean: 'boolean',
} as Record<string, string>

export const isVueTypesDef = (ast: ts.Node, vueTypesAlias?: string): boolean => {
  if (!vueTypesAlias) {
    return false;
  }
  const rootId = findExpressionRootNode(ast);
  return !!rootId && rootId.text === vueTypesAlias;
}

const collectUsedVars = (ast: ts.Node) => {
  const res: Record<string, true> = {};
  traverseAst(
    ast,
    (n) => {
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        res[n.expression.text] = true;
      } else if (ts.isIdentifier(n)) {
        const parent = n.parent;
        if (!ts.isPropertyAccessExpression(parent)) {
          res[n.text] = true;
        }
      }
    }
  );
  return res;
}

export const parseVueTypesDef = (root: ts.Node): Partial<PropDef> => {
  const res: Partial<PropDef> = {};
  const usedVars = {};

  const traverse = (ast: ts.Node) => traverseAst(
    ast,
    (n) => {
      if (ts.isCallExpression(n)) {
        const expr = n.expression;
        if (ts.isPropertyAccessExpression(expr)) {
          const method = expr.name.text;
          if (method === 'def') {
            res.def = n.arguments[0];
            Object.assign(usedVars, collectUsedVars(n.arguments[0]));
          } else if (method === 'oneOf') {

          } else if (method === 'oneOfType') {

          }
        }
        return false;
      }
    }
  );
  traverse(root);
  res.usedVars = Object.keys(usedVars);
  return res;
}

/**
 export interface VueTypesInterface {
  sensibleDefaults: TypeDefaults | boolean
  extend<T extends VueTypesInterface>(props: ExtendProps | ExtendProps[]): T
  utils: VueTypesUtils
  readonly any: VueTypeValidableDef
  readonly bool: VueTypeValidableDef<boolean>
  readonly func: VueTypeValidableDef<() => any>
  readonly array: VueTypeValidableDef<any[]>
  readonly string: VueTypeValidableDef<string>
  readonly number: VueTypeValidableDef<number>
  readonly object: VueTypeValidableDef<{ [key: string]: any }>
  readonly integer: VueTypeDef<number>
  readonly symbol: VueTypeValidableDef<symbol>
  custom<T = any>(
    fn: ValidatorFunction<T>,
    warnMsg?: string,
  ): VueTypeCustom<T, ValidatorFunction<T>>
  oneOf<T = any>(arr: T[]): VueTypeDef<T>
  instanceOf<C extends Constructor>(
    instanceConstructor: C,
  ): VueTypeInstanceOf<C>
  oneOfType(arr: (Prop<any> | VueProp<any>)[]): VueTypeDef
  arrayOf<V extends any, D = defaultType<V>>(
    type: VueTypeValidableDef<V> | VueTypeDef<V, D> | Prop<V>,
  ): VueTypeDef<V[]>
  objectOf<T extends any>(type: Prop<T> | VueProp<T>): VueTypeObjectOf<T>
  shape<T>(
    obj: { [K in keyof T]?: Prop<T[K]> | VueProp<T[K], any> },
  ): VueTypeShape<T>
}
 */

export const collectProps = (props: ts.Node | undefined, vueTypesAlias?: string | undefined): PropDef[] => {
  if (!props) {
    return [];
  }
  if (ts.isArrayLiteralExpression(props)) {
    return props.elements.filter(ts.isStringLiteral).map(
      (propName) => ({ name: propName.text })
    )
  }
  if (ts.isObjectLiteralExpression(props)) {
    const res: PropDef[] = [];
    props.properties.filter(ts.isPropertyAssignment).forEach(
      (propEl) => {
        if (!ts.isIdentifier(propEl.name)) {
          return;
        }
        const prop: PropDef = {
          name: propEl.name.text,
          jsDoc: getJsDoc(propEl)
        };
        const valNode = propEl.initializer;
        if (ts.isObjectLiteralExpression(valNode)) {
          prop.def = getPropNode(valNode, 'default');
          const typeNode = getPropNode(valNode, 'type');
          if (typeNode) {
            const typeNodeStr = typeNode.getText();
            prop.type = ctorToTsType[typeNodeStr];
          }
        } else if (isVueTypesDef(valNode, vueTypesAlias)) {
          const vt = parseVueTypesDef(valNode);
          Object.assign(prop, vt);
        }
        res.push(prop);
      }
    );
    return res;
  }
  return [];
}
