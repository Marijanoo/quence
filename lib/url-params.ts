import type { KeyValuePair } from '@/lib/db/types'
import { createKeyValuePair } from '@/lib/db/types'

export function splitUrl(url: string): { base: string; search: string } {
  let depth = 0
  for (let i = 0; i < url.length; i++) {
    if (url[i] === '{' && url[i + 1] === '{') { depth++; i++; continue }
    if (url[i] === '}' && url[i + 1] === '}') { depth--; i++; continue }
    if (url[i] === '?' && depth === 0) return { base: url.slice(0, i), search: url.slice(i + 1) }
  }
  return { base: url, search: '' }
}

export function paramsToSearch(params: KeyValuePair[]): string {
  return params
    .filter(p => p.enabled && p.key)
    .map(p => p.value ? `${p.key}=${p.value}` : p.key)
    .join('&')
}

export function searchToParams(search: string, existing: KeyValuePair[]): KeyValuePair[] {
  if (!search) return []
  const pairs = search.split('&').map(part => {
    const eq = part.indexOf('=')
    const key = eq === -1 ? part : part.slice(0, eq)
    const value = eq === -1 ? '' : part.slice(eq + 1)
    const found = existing.find(p => p.key === key)
    return found ? { ...found, value, enabled: true } : { ...createKeyValuePair(key, value), enabled: true }
  })
  const disabled = existing.filter(p => !p.enabled && p.key)
  return [...pairs, ...disabled]
}
