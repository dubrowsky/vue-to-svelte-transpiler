module.exports = {
  source: './repl-vue/src',
  target: './repl-svelte/src',
  ignore: (f) => {
    const rex = [
      /\.d\.ts$/, // skip shims-vue.d.ts
      /src\/main\.ts/
    ]
    return rex.some(r => r.test(f))
  },
  copy: (f) => {
    return /sample\/.+\.vue/.test(f)
  }
}
