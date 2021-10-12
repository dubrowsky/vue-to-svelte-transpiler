import {getTsAst, traverseAst} from "../ts";
import * as ts from "typescript";

export const VUE_NODE_TYPE = {
    ELEMENT: 1,
    EXPRESSION: 2,
    TEXT: 3
};

export const isUnaryTag = (
    'area,base,br,col,embed,frame,hr,img,input,isindex,keygen,' +
    'link,meta,param,source,track,wbr,svelte:component'
).split(',').reduce((res, v) => ({...res, [v]: true}), {}) as Record<string, true>;

export const extractVarsFromForAlias = (expr: string): string[] => {
    if (expr.indexOf('{') === -1) {
        return [expr];
    }
    const res: string[] = [];
    const ast = getTsAst(`const ${expr}`);
    traverseAst(
      ast,
      (n: ts.Node) => {
          if (ts.isBindingElement(n) && ts.isIdentifier(n.name)) {
              res.push(n.name.getText(ast))
          }
      }
    );
    return res;
}

export const unprefix = (str: string, prefix: string):  string | boolean => {
    if (str.slice(0, prefix.length) === prefix) {
        return str.slice(prefix.length);
    }
    return false;
}
