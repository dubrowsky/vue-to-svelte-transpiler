// import { createApp } from 'vue'
import Vue from 'vue';
import App from './App.vue';

(new Vue({
  render(h) {
    return h(App)
  }
})).$mount('#app');
// console.log('mounting', [App.$mount], Object.keys(App));


///console.log('mounted??', App);


/*
new Vue({
  element: '#app',
  render(h) {
    return h('div')
  }
})
 */

// createApp(App).mount('#app')
