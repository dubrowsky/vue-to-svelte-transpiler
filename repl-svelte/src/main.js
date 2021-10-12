import App from './App.svelte';

const inst = new App({
  target: document.querySelector('#app'),
});

console.log('inst?', inst, document.querySelector('#app'))
