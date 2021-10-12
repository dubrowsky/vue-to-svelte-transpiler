const requireFiles = require.context('!raw-loader!./sample', true, /\.(vue|js)$/);

const sampleFiles: File[] = requireFiles.keys().map(
  fileName => ({
    name: fileName.replace(/^\.\//, ''),
    content: requireFiles(fileName).default
  })
);

import { File } from '@/types';

export const getDefaultFileContent = (): string => {
  let def = sampleFiles.find(f => f.name === '_default.vue');
  if (!def) {
    def = getDefaultFiles()[0];
  }
  return def.content;
}

export const getDefaultFiles = (): File[] => sampleFiles.filter(
  ({ name }) => name[0] !== '_',
);
