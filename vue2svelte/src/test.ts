import *  as ts from 'typescript';
import { getTsAst, traverseAst } from "./ts";

const src = `
const p = Types.isRequired.oneOfType([Types.number, Types.arrayOf(Types.number)]).def(42)
`

const ast = getTsAst(src);

let expr: ts.Expression | undefined;

traverseAst(
  ast,
  (n) => {
    if (ts.isVariableDeclaration(n)) {
      expr = n.initializer;
    }
  }
);

/*
const buildDiv2 = (className: string) => {
  const div = document.createElement('div')
  div.className = className
  const text = document.createTextNode('bar')
  div.appendChild(text)
  return div
}

const buildDiv = (className: string) => {
  return `<div class="${className}">bar</div>`
}


buildDiv()
*/
