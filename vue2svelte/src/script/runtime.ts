export const runtime = `
import { tick } from 'svelte';

export const makeWatcher = (val, fn, immediate) => {
  let oldVal = val;
  let ready = immediate;
  return (newVal) => {
    if (!ready) {
      ready = true;
      return;
    }
    fn(newVal, oldVal);
    oldVal = newVal;
  }
}

export const makeClassName = (val) => {
  const typ = typeof val;
  if (typ === 'string') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(makeClassName).filter(Boolean).join(' ');
  }
  if (typ === 'object') {
    return Object.entries(val).reduce(
      (acc, [key, value]) => {
        if (value) {
          acc.push(key);
        }
        return acc;
      },
      [],
    ).join(' ');
  }
  return val;
}

const toKebab = str => {
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const lower = ch.toLowerCase();
    if (lower !== ch) {
      res += '-'+lower;
    } else {
      res += ch;
    }
  }
  return res;
}


export const makeStyle = (val) => {
  const typ = typeof val;
  if (typ === 'string') {
    return val;
  }
  if (typ === 'object') {
    return Object.entries(val).map(
      ([key, value]) => toKebab(key) + ': ' + value
    ).join('; ');
  }
  if (Array.isArray(val)) {
    return val.map(makeStyle).join('; ');
  }
}

export const unwrapEvent = (e) => e instanceof CustomEvent ? e.detail : e;

export const nextTick$ = (fn = (() => {})) => tick().then(fn)
`;
