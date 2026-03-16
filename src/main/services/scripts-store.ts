import Store from 'electron-store'

const INDEX_KEY = 'index'
const METADATA_KEY = 'metadata'

export type ScriptLocalMetadata = {
  md5: string
  scriptId?: number
}

const store = new Store<{
  [INDEX_KEY]: Record<string, string>
  [METADATA_KEY]: Record<string, ScriptLocalMetadata>
}>({
  name: 'scripts',
})

/**
 * 获取脚本索引（脚本名 → md5）。
 * 未存储过时返回空对象。
 */
export function getScriptsIndex(): Record<string, string> {
  const value = store.get(INDEX_KEY)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, string>
}

/**
 * 写入脚本索引。
 */
export function setScriptsIndex(index: Record<string, string>): void {
  store.set(INDEX_KEY, index)
}

/**
 * 获取脚本元数据（脚本名 -> md5/scriptId）。
 */
export function getScriptsMetadata(): Record<string, ScriptLocalMetadata> {
  const value = store.get(METADATA_KEY)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, ScriptLocalMetadata>
}

/**
 * 写入脚本元数据。
 */
export function setScriptsMetadata(metadata: Record<string, ScriptLocalMetadata>): void {
  store.set(METADATA_KEY, metadata)
}
