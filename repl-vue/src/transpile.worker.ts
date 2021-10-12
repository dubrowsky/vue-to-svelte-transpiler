import { Transpiler } from 'vue2svelte';
import { File, TranspileMessage } from "@/types";

const ctx: Worker = self as any;

// Post data to parent thread
// ctx.postMessage({ foo: "foo" });

const sleep = (duration: number) => {
  const now = Date.now();
  console.log('start sleep');
  while (Date.now() - now < duration) {

  }
  console.log('go on')
}

const transpile = (files: File[]) => {
  const filesByName = files.reduce(
    (acc, f) => ({
      ...acc,
      [f.name]: f.content,
    }),
    {} as Record<string, string>,
  );
  const transpiler = new Transpiler(
    files.map(f => f.name),
    {
      getFileContent: fileName => filesByName[fileName],
      resolve: filePath => filePath,
      emitAlias: 'dispatch'
    }
  );
  transpiler.run();
  return transpiler.result.map(
    (f) => ({
      content: f.content || '',
      name: f.path
    }),
  );
}

// Respond to message from parent thread
ctx.addEventListener(
  "message",
  (event) => {
    const data: TranspileMessage = event.data;
    const files = transpile(data.files);
    ctx.postMessage({ files, id: data.id });
  }
);
