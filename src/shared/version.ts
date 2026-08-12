import { clean, coerce, compare, valid } from 'semver'

function normalizeVersion(version: string): string {
  const normalized = clean(version.trim()) ?? version.trim().replace(/^v/i, '')
  if (valid(normalized)) return normalized
  return coerce(normalized)?.version ?? '0.0.0'
}

export function compareVersion(a: string, b: string): number {
  return compare(normalizeVersion(a), normalizeVersion(b))
}
