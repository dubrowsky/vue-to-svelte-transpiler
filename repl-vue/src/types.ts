export type UpdateTabEvent = {
  oldName: string
  newName: string
}

export type Tab = {
  key: string,
  label: string
}

export type File = {
  name: string
  content: string
}

export type TranspileMessage = {
  files: File[],
  id: number
}
