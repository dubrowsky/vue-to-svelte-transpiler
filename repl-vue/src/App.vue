<template>
  <div :class="$style.app">
    <div :class="$style.vue">
      <Tabs
        :class="$style.tabs"
        :tabs="vueTabs"
        :active="selectedFileIndex"
        :add="true"
        :edit="true"
        @selectTab="selectFile"
        @addTab="addFile"
        @updateTabName="updateFileName"
        @deleteTab="deleteFile"
      />
      <Editor
        :class="$style.editor"
        :value="selectedFileContent"
        :fileName="selectedFile.name"
        @update="updateFileContent"
      />
    </div>
    <div :class="$style.svelte">
      <template>
        <Tabs
          :class="$style.tabs"
          :tabs="svelteTabs"
          :active="selectedSvelteFileIndex"
          :add="false"
          :edit="false"
          @selectTab="selectSvelteFile"
        />
        <Editor
          :class="$style.editor"
          :value="selectedSvelteFileContent"
          :fileName="selectedSvelteFileName"
          :disabled="true"
        />
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
// import { Transpiler } from 'vue2svelte';
import Tabs from './components/Tabs.vue';
import Editor from './components/Editor.vue';
import { File, TranspileMessage } from './types';
import { getDefaultFiles, getDefaultFileContent } from '@/helpers';

import Worker from "worker-loader!./transpile.worker";
const worker = new Worker();

export default Vue.extend({
  name: 'App',
  components: {
    Tabs,
    Editor,
  },
  data() {
    return {
      files: getDefaultFiles(),
      svelteFiles: [] as File[],
      selectedFileIndex: 0,
      selectedSvelteFileIndex: 0,
      timeout: 0,
      lastMessageId: 0,
    };
  },
  methods: {
    updateSvelteFiles() {
      const id = Math.random();
      this.lastMessageId = id;
      worker.postMessage({
        files: this.files,
        id,
      });
    },
    addFile() {
      this.files = this.files.concat({
        name: `com${this.files.length}.vue`,
        content: getDefaultFileContent(),
      });
    },
    selectFile(index: number) {
      if (!this.files[index]) {
        return;
      }
      this.selectedFileIndex = index;
    },
    deleteFile() {
      const cIndex = this.selectedFileIndex;
      this.files = this.files.filter(
        (file, index) => index !== cIndex,
      );
      this.selectedFileIndex = Math.min(this.files.length - 1, cIndex);
    },
    updateCurrentFile(newProps: Partial<File>) {
      const ci = this.selectedFileIndex;
      this.files = this.files.map((f, i) => i === ci ? { ...f, ...newProps } : f);
    },
    updateFileContent(content: string) {
      this.updateCurrentFile( { content })
    },
    updateFileName(name: string) {
      this.updateCurrentFile({ name })
    },
    selectSvelteFile(index: number) {
      this.selectedSvelteFileIndex = index;
    },
  },
  computed: {
    vueTabs(): string[] {
      return this.files.map(f => f.name);
    },
    svelteTabs(): string[] {
      return this.svelteFiles.map(f => f.name);
    },
    selectedFile(): File {
      return this.files[this.selectedFileIndex] || getDefaultFiles()[0];
    },
    selectedFileContent(): string {
      return this.selectedFile.content;
    },
    selectedSvelteFileContent(): string {
      const file = this.svelteFiles[this.selectedSvelteFileIndex];
      if (!file) {
        return '';
      }
      return file.content;
    },
    selectedSvelteFileName(): string {
      const file = this.svelteFiles[this.selectedSvelteFileIndex];
      if (!file) {
        return '';
      }
      return file.name;
    }
  },
  watch: {
    files() {
      clearTimeout(this.timeout);
      this.timeout = setTimeout(
          this.updateSvelteFiles,
          50,
      );
    }
  },
  created() {
    worker.addEventListener("message", (event: MessageEvent) => {
      const data: TranspileMessage = event.data;
      if (this.lastMessageId === data.id) {
        this.svelteFiles = data.files;
      } else {
        console.log('wrong message id', this.lastMessageId)
      }
    });
    this.updateSvelteFiles();
  }
});
</script>

<style module>
.app {
  display: flex;
  height: 100vh;
  color:#aaa;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
}
.tabs {
  border-bottom: 8px solid #000;
}
.vue, .svelte {
  width: 50%;
  display: flex;
  flex-direction: column;
}
.editor {
  flex-grow: 1;
  overflow: hidden;
}
</style>
