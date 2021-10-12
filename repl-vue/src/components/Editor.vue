<template>
  <div class="container">
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import monaco, { editors, diffToEdits } from '../monaco';
// import { diffLines } from 'diff'
const Diff = require('diff');

export default Vue.extend({
  data() {
    return {
      id: Math.random(),
      lno: 2,
      txt: 'hello!'
    };
  },
  props: {
    value: String,
    disabled: Boolean,
    fileName: String,
    useDiffs: Boolean,
  },
  methods: {
    tick() {
      if (!this.editor) {
        return;
      }
      const { lno, txt } = this;
      const model = this.editor.getModel();
      if (!model) {
        return;
      }
      model.applyEdits([
        {
          text: txt,
          range: {
            startLineNumber: Number(lno),
            startColumn: 0,
            endLineNumber: Number(lno),
            endColumn: model.getLineLength(Number(lno)) + 1,
          }
        }
      ]);
    },
    drop() {
      if (!this.editor) {
        return;
      }
      const { lno } = this;
      const model = this.editor.getModel();
      if (!model) {
        return;
      }
      model.applyEdits([
        {
          text: '',
          range: {
            startLineNumber: Number(lno),
            startColumn: 0,
            endLineNumber: Number(lno + 1),
            endColumn: 0
          }
        }
      ]);
    },
  },
  computed: {
    editor(): monaco.editor.ICodeEditor | undefined {
      return editors[this.id];
    },
    extension(): string {
      const ext = (this.fileName || '').match(/\.(.+)$/);
      return ext ? ext[1].toLowerCase() : 'svelte';
    },
    language(): string {
      // const extension = this.extension as any as string;
      return ({
        vue: 'vue',
        css: 'css',
        pcss: 'css',
        svelte: 'svelte',
        js: 'javascript',
        ts: 'typescript'
      } as Record<string, string>)[this.extension] || 'html';
    }
  },
  mounted() {
    const editor = monaco.editor.create(this.$el as HTMLElement, {
      value: this.value,
      language: this.language,
      theme: 'ozonTech',
      scrollBeyondLastLine: false,
      readOnly: this.disabled,
      tabSize: 2,
      fontSize: 18,
      fontFamily: 'Hack',
      renderIndentGuides: false,
      // guides: { indentation: false },
      wordWrap: 'on',
      lineNumbers: 'off',
      minimap: {
        enabled: false
      }
    });
    editor.onDidChangeModelContent( (e) => {
      const nextValue = editor.getValue();
      if (this.value !== nextValue) {
        this.$emit('update', nextValue);
      }
    });
    editors[this.id] = editor;
    window.addEventListener('resize', () => {
      editor.layout()
    })
  },
  destroyed() {
    delete editors[this.id];
  },
  watch: {
    value(newValue: string) {
      const { editor } = this;
      if (!editor) {
        return;
      }
      const oldValue = editor.getValue();
      if (newValue === oldValue) {
        return;
      }
      const model = editor.getModel();
      if (this.useDiffs && model) {
        const diff = Diff.diffLines(oldValue, newValue);
        const ops = diffToEdits(diff, model);
        console.log(ops);
        model.applyEdits(ops);
        editor.setSelection(new monaco.Selection(0, 0, 0, 0));
        return;
      }
      editor.setValue(newValue);
    },
    language(language) {
      const model = this.editor ? this.editor.getModel() : null;
      if (!model) {
        return;
      }
      monaco.editor.setModelLanguage(
        model,
        language
      );
    }
  }
})
</script>
