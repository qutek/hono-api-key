import type { ApiKeyRecord, RateLimitConfig, StorageAdapter } from '../types'

type KVNamespaceLike = {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export class KvAdapter implements StorageAdapter {
  private readonly kv: KVNamespaceLike
  private readonly ns: string

  constructor(kv: KVNamespaceLike, namespacePrefix: string = 'apikey:') {
    this.kv = kv
    this.ns = namespacePrefix.endsWith(':') ? namespacePrefix : `${namespacePrefix}:`
  }

  private keyForId(id: string) {
    return `${this.ns}id:${id}`
  }
  private keyForValue(value: string) {
    return `${this.ns}value:${value}`
  }
  private keyForOwner(ownerId: string) {
    return `${this.ns}owner:${ownerId}`
  }
  private keyForRate(id: string) {
    return `${this.ns}rate:${id}`
  }

  async saveKey(apiKey: ApiKeyRecord): Promise<ApiKeyRecord> {
    const idKey = this.keyForId(apiKey.id)
    const valueKey = this.keyForValue(apiKey.key)
    const ownerKey = this.keyForOwner((apiKey as any).ownerId)

    await Promise.all([
      this.kv.put(idKey, JSON.stringify(apiKey)),
      this.kv.put(valueKey, apiKey.id),
      (async () => {
        const existing = (await this.kv.get(ownerKey)) || '[]'
        const list = new Set<string>(JSON.parse(existing))
        list.add(apiKey.id)
        await this.kv.put(ownerKey, JSON.stringify(Array.from(list)))
      })(),
    ])
    return apiKey
  }

  async getKeyById(keyId: string): Promise<ApiKeyRecord | null> {
    const data = await this.kv.get(this.keyForId(keyId))
    return data ? (JSON.parse(data) as ApiKeyRecord) : null
  }

  async getKeyByValue(keyValue: string): Promise<ApiKeyRecord | null> {
    const id = await this.kv.get(this.keyForValue(keyValue))
    if (!id) return null
    return this.getKeyById(id)
  }

  async getKeysByownerId(ownerId: string): Promise<ApiKeyRecord[]> {
    const ownerKey = this.keyForOwner(ownerId)
    const data = (await this.kv.get(ownerKey)) || '[]'
    const ids: string[] = JSON.parse(data)
    if (!ids.length) return []
    const results = await Promise.all(ids.map((id) => this.kv.get(this.keyForId(id))))
    return results
      .filter((v): v is string => Boolean(v))
      .map((json) => JSON.parse(json) as ApiKeyRecord)
  }

  async updateKey(keyId: string, updatedKey: ApiKeyRecord): Promise<ApiKeyRecord | null> {
    const existing = await this.getKeyById(keyId)
    if (!existing) return null

    // Update value mapping if key changed
    if (existing.key !== updatedKey.key) {
      await this.kv.delete(this.keyForValue(existing.key))
      await this.kv.put(this.keyForValue(updatedKey.key), keyId)
    }

    // Update owner mapping if owner changed
    const existingOwner = (existing as any).ownerId
    const newOwner = (updatedKey as any).ownerId
    if (existingOwner !== newOwner) {
      const oldOwnerKey = this.keyForOwner(existingOwner)
      const oldList = new Set<string>(JSON.parse((await this.kv.get(oldOwnerKey)) || '[]'))
      oldList.delete(keyId)
      await this.kv.put(oldOwnerKey, JSON.stringify(Array.from(oldList)))

      const newOwnerKey = this.keyForOwner(newOwner)
      const newList = new Set<string>(JSON.parse((await this.kv.get(newOwnerKey)) || '[]'))
      newList.add(keyId)
      await this.kv.put(newOwnerKey, JSON.stringify(Array.from(newList)))
    }

    await this.kv.put(this.keyForId(keyId), JSON.stringify(updatedKey))
    return updatedKey
  }

  async deleteKey(keyId: string): Promise<boolean> {
    const existing = await this.getKeyById(keyId)
    if (!existing) return false
    await Promise.all([
      this.kv.delete(this.keyForId(keyId)),
      this.kv.delete(this.keyForValue(existing.key)),
      (async () => {
        const ownerKey = this.keyForOwner((existing as any).ownerId)
        const list = new Set<string>(JSON.parse((await this.kv.get(ownerKey)) || '[]'))
        list.delete(keyId)
        await this.kv.put(ownerKey, JSON.stringify(Array.from(list)))
      })(),
      this.kv.delete(this.keyForRate(keyId)),
    ])
    return true
  }

  async checkRateLimit(keyId: string, rateLimit: RateLimitConfig): Promise<boolean> {
    const now = Date.now()
    const key = this.keyForRate(keyId)
    const state = (JSON.parse((await this.kv.get(key)) || 'null') as {
      requests: number[]
      windowStart: number
    } | null) ?? { requests: [], windowStart: now }

    const windowMs = rateLimit.windowMs
    const maxRequests = rateLimit.maxRequests

    if (now - state.windowStart > windowMs) {
      state.requests = []
      state.windowStart = now
    }

    state.requests = state.requests.filter((ts) => now - ts < windowMs)
    if (state.requests.length >= maxRequests) {
      await this.kv.put(key, JSON.stringify(state))
      return false
    }

    state.requests.push(now)
    await this.kv.put(key, JSON.stringify(state))
    return true
  }
}

export default KvAdapter
