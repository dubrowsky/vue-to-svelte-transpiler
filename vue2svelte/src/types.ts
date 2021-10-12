export type CssModulesOptions = {
  vueVar: string,
  svelteVar: string
}

export type RuntimeOptions = {
  alias: string
  path: string
}

export type TranspilerOptions = {
  getFileContent: (path: string) => string
  resolve: (path: string, ctx: string) => string
  cssModules?: boolean | Partial<CssModulesOptions>
  emitAlias?: string
  nextTickAlias?: string
  refsAlias?: string
  elAlias?: string,
  runtime?: Partial<RuntimeOptions>,
  copy?: (path: string) => boolean
}

export type OutputFile = {
  sourcePath?: string
  path: string
  content?: string
  errors?: Error[],
}

export type TranspilerContext = {
  getFileContent: (path: string) => string
  resolve: (path: string, ctx: string) => string
  addOutputFile: (f: OutputFile) => void
  emitAlias: string
  nextTickAlias: string
  cssModules?: CssModulesOptions,
  getVarMap: () => Record<string, string>
  addRuntime: (vars: string[]) => string,
  refsAlias: string
  elAlias: string
}

export const foo = 'bad';

export type ScriptInfo = {
  hasEl?: boolean
  hasJsx?: boolean
}
