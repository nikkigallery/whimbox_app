import Store from 'electron-store'

const INDEX_KEY = 'index'

const store = new Store<{ [INDEX_KEY]: Record<string, string> }>({
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
