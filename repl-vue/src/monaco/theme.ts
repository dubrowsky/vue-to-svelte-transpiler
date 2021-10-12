import * as monaco from "monaco-editor";

const { green, red, blue, lightBlue, yellow } = Object.entries({
  green: '#30E900',
  red: '#F91155',
  blue: '#005BFF',
  lightBlue: '#00A2FF',
  yellow: '#FFDC00',
}).reduce(
  (acc, [name, color]) => {
    const foreground = color.slice(1)
    acc[name] = (token: string) => ({token, foreground })
    return acc;
  },
  {} as Record<string, (token: string) => monaco.editor.ITokenThemeRule>
);

export default {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'FFFFFF' },
    yellow('comment'),
    green('keyword'),
    blue('number'),
    red('string'),
    lightBlue('class'),
    lightBlue('type'),
    green('method'),
    green('variable'),
    // green('identifier'),
    lightBlue('identifier.prop'),
    lightBlue('identifier.func'),
    blue('tag'),
    lightBlue('attribute.name'),
    red('attribute.value'),
  ],
  colors: {
    'editor.background': "#000" // 001a34
  }
} as monaco.editor.IStandaloneThemeData;
