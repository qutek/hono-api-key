import type { ApiKeyRecord, RateLimitConfig, StorageAdapter } from '../types'

export class MemoryAdapter implements StorageAdapter {
  private readonly keysById: Map<string, ApiKeyRecord> = new Map()
  private readonly keyValueToId: Map<string, string> = new Map()
  private readonly ownerIdToKeyIds: Map<string, Set<string>> = new Map()
  private readonly rateLimits: Map<string, { requests: number[]; windowStart: number }> = new Map()

  async saveKey(apiKey: ApiKeyRecord): Promise<ApiKeyRecord> {
    this.keysById.set(apiKey.id, apiKey)
    this.keyValueToId.set(apiKey.key, apiKey.id)
    if (!this.ownerIdToKeyIds.has(apiKey.ownerId)) {
      this.ownerIdToKeyIds.set(apiKey.ownerId, new Set())
    }
    this.ownerIdToKeyIds.get(apiKey.ownerId)!.add(apiKey.id)
    return apiKey
  }

  async getKeyById(keyId: string): Promise<ApiKeyRecord | null> {
    return this.keysById.get(keyId) ?? null
  }

  async getKeyByValue(keyValue: string): Promise<ApiKeyRecord | null> {
    const id = this.keyValueToId.get(keyValue)
    return id ? this.keysById.get(id) ?? null : null
  }

  async getKeysByownerId(ownerId: string): Promise<ApiKeyRecord[]> {
    const ids = this.ownerIdToKeyIds.get(ownerId)
    if (!ids) return []
    const records: ApiKeyRecord[] = []
    for (const id of ids) {
      const rec = this.keysById.get(id)
      if (rec) records.push(rec)
    }
    return records
  }

  async updateKey(keyId: string, updatedKey: ApiKeyRecord): Promise<ApiKeyRecord | null> {
    const existing = this.keysById.get(keyId)
    if (!existing) return null

    this.keysById.set(keyId, updatedKey)

    if (existing.key !== updatedKey.key) {
      this.keyValueToId.delete(existing.key)
    }
    this.keyValueToId.set(updatedKey.key, keyId)

    if ((existing as any).ownerId !== (updatedKey as any).ownerId) {
      const prevSet = this.ownerIdToKeyIds.get((existing as any).ownerId)
      prevSet?.delete(keyId)
      if (!this.ownerIdToKeyIds.has((updatedKey as any).ownerId)) {
        this.ownerIdToKeyIds.set((updatedKey as any).ownerId, new Set())
      }
      this.ownerIdToKeyIds.get((updatedKey as any).ownerId)!.add(keyId)
    }

    return updatedKey
  }

  async deleteKey(keyId: string): Promise<boolean> {
    const existing = this.keysById.get(keyId)
    if (!existing) return false
    this.keysById.delete(keyId)
    this.keyValueToId.delete(existing.key)
    const set = this.ownerIdToKeyIds.get((existing as any).ownerId)
    set?.delete(keyId)
    if (set && set.size === 0) this.ownerIdToKeyIds.delete((existing as any).ownerId)
    this.rateLimits.delete(keyId)
    return true
  }

  async checkRateLimit(keyId: string, rateLimit: RateLimitConfig): Promise<boolean> {
    const now = Date.now()
    const windowMs = rateLimit.windowMs
    const maxRequests = rateLimit.maxRequests

    let state = this.rateLimits.get(keyId)
    if (!state) {
      state = { requests: [], windowStart: now }
      this.rateLimits.set(keyId, state)
    }

    if (now - state.windowStart > windowMs) {
      state.requests = []
      state.windowStart = now
    }

    state.requests = state.requests.filter((ts) => now - ts < windowMs)
    if (state.requests.length >= maxRequests) return false
    state.requests.push(now)
    return true
  }

  async clear(): Promise<void> {
    this.keysById.clear()
    this.keyValueToId.clear()
    this.ownerIdToKeyIds.clear()
    this.rateLimits.clear()
  }
}

let singleton: MemoryAdapter | null = null
export function getMemoryAdapter(): MemoryAdapter {
  if (!singleton) singleton = new MemoryAdapter()
  return singleton
}

export default MemoryAdapter

