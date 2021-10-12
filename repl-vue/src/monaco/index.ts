import * as monaco from "monaco-editor";
import theme from './theme'
import vueLang from './vue'
import svelteLang from './svelte'
import jsLang from './javascript';
import {editor} from "monaco-editor";
import ITextModel = editor.ITextModel;
import IIdentifiedSingleEditOperation = editor.IIdentifiedSingleEditOperation;

monaco.languages.register({ id: 'vue' })
monaco.languages.setMonarchTokensProvider('vue', vueLang)

monaco.languages.register({ id: 'svelte' })
monaco.languages.setMonarchTokensProvider('svelte', svelteLang)

monaco.languages.register({ id: 'js' })
monaco.languages.setMonarchTokensProvider('js', jsLang)

monaco.languages.register({ id: 'ts' })
monaco.languages.setMonarchTokensProvider('ts', jsLang)

monaco.editor.defineTheme('ozonTech', theme);

export default monaco;

export const editors = {} as Record<number, monaco.editor.ICodeEditor>;

const Diff = require('diff');

type Diff = {
  added?: boolean
  removed?: boolean
  count: number
  value: string
}

type Op = {
  type: 'add' | 'remove' | 'replace' | 'keep'
  length: number
  value: string
  oldLength: number
  oldValue?: string
}

const opType = (d: Diff): ('keep' | 'add' | 'remove') => {
  if (d.added) {
    return 'add';
  }
  if (d.removed) {
    return 'remove'
  }
  return 'keep'
}

const diffsToOps = (diffs: Diff[]): Op[] => {
  const res: Op[] = []
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    const type = opType(d)
    if (type === 'keep') {
      res.push({ type, length: d.count, value: d.value, oldLength: 0 })
      continue;
    }
    const next = diffs[i + 1];

    if (next) {
      const nextType = opType(next);
      if (nextType !== 'keep') {
        res.push({
          type: 'replace',
          ...(type === 'add' ? {
            length: d.count,
            value: d.value,
            oldLength: next.count,
            oldValue: next.value,
          } : {
            length: next.count,
            value: next.value,
            oldLength: d.count,
            oldValue: d.value,
          })
        });
        i+= 1;
        continue;
      }
    }
    res.push({type, length: d.count, value: d.value, oldLength: 0 })
  }
  return res;
}

export const diffToEdits = (diffs: Diff[], model: ITextModel): IIdentifiedSingleEditOperation[] => {
  const res: IIdentifiedSingleEditOperation[] = [];
  const ops = diffsToOps(diffs);
  let cLine = 1;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.type === 'keep') {
      cLine += op.length;
      continue
    }
    if (op.type === 'add') {
      res.push({
        text: op.value,
        range: {
          startLineNumber: cLine,
          startColumn: 0,
          endLineNumber: cLine,
          endColumn: 0
        }
      })
      continue;
    }
    if (op.type === 'remove') {
      res.push({
        text: '',
        range: {
          startLineNumber: cLine,
          startColumn: 0,
          endLineNumber: cLine + op.length,
          endColumn: 0
        }
      })
      cLine += op.length
      continue;
    }
    // replace
    res.push({
      text: op.value,
      range: {
        startLineNumber: cLine,
        startColumn: 0,
        endLineNumber: cLine + op.oldLength,
        endColumn: 0
      }
    });
    cLine += op.oldLength
  }
  // console.log({ diffs, ops, res });
  return res
}
