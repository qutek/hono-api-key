import type { ApiKeyRecord, RateLimitConfig, SanitizedApiKeyRecord, StorageAdapter } from './types'

export type ApiKeyManagerOptions = {
  adapter: StorageAdapter
  prefix?: string
  keyLength?: number
  rateLimit?: RateLimitConfig
}

export class ApiKeyManager {
  private readonly adapter: StorageAdapter
  private readonly prefix: string
  private readonly keyLength: number
  private readonly rateLimit: RateLimitConfig

  constructor(options: ApiKeyManagerOptions) {
    this.adapter = options.adapter
    this.prefix = options.prefix ?? ''
    this.keyLength = options.keyLength ?? 12
    this.rateLimit = options.rateLimit ?? { windowMs: 60_000, maxRequests: 60 }
  }

  private generateKey(): string {
    const bytes = new Uint8Array(this.keyLength)
    crypto.getRandomValues(bytes)
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return `${this.prefix}${hex}`
  }

  async createKey(options: {
    ownerId: string
    name: string
    permissions?: Record<string, unknown>
    rateLimit?: RateLimitConfig | null
    expiresAt?: Date | string | null
    metadata?: Record<string, unknown>
  }): Promise<ApiKeyRecord> {
    const {
      ownerId,
      name,
      permissions = {},
      rateLimit = null,
      expiresAt = null,
      metadata = {},
    } = options
    if (!ownerId) throw new Error('Owner Id is required')
    if (!name) throw new Error('API key name is required')

    const key = this.generateKey()
    const id = crypto.randomUUID()
    const now = new Date()

    const record: ApiKeyRecord = {
      id,
      key,
      ownerId,
      name,
      permissions,
      rateLimit: rateLimit ?? undefined,
      isActive: true,
      createdAt: now.toISOString(),
      lastUsedAt: null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      metadata,
    }

    await this.adapter.saveKey(record)
    return record
  }

  async getKeys(ownerId: string, includeKey: boolean = false): Promise<SanitizedApiKeyRecord[]> {
    if (!ownerId) throw new Error('Owner Id is required')
    const keys = await this.adapter.getKeysByownerId(ownerId)
    return keys.map(({ key: _hidden, ...rest }) =>
      includeKey ? { ...rest, key: _hidden } : rest,
    ) as any
  }

  async getKeyById(keyId: string, ownerId?: string): Promise<SanitizedApiKeyRecord | null> {
    if (!keyId) throw new Error('API key ID is required')
    const key = await this.adapter.getKeyById(keyId)
    if (!key) return null
    if (ownerId && (key as any).ownerId !== ownerId) return null
    const { key: _hidden, ...rest } = key
    return rest
  }

  async updateKey(
    keyId: string,
    ownerId: string,
    updates: Partial<
      Pick<
        ApiKeyRecord,
        'name' | 'isActive' | 'permissions' | 'expiresAt' | 'metadata' | 'rateLimit'
      >
    >,
  ): Promise<SanitizedApiKeyRecord | null> {
    if (!keyId) throw new Error('API key ID is required')
    if (!ownerId) throw new Error('Owner Id is required')

    const existing = await this.adapter.getKeyById(keyId)
    if (!existing) return null
    if ((existing as any).ownerId !== ownerId) return null

    const updated: ApiKeyRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      key: existing.key,
      ownerId: (existing as any).ownerId,
      createdAt: existing.createdAt,
    }
    if (updates.expiresAt) {
      updated.expiresAt = new Date(updates.expiresAt as string).toISOString()
    }

    const saved = await this.adapter.updateKey(keyId, updated)
    if (!saved) return null
    const { key: _hidden, ...rest } = saved
    return rest
  }

  async deleteKey(keyId: string, ownerId: string): Promise<boolean> {
    if (!keyId) throw new Error('API key ID is required')
    if (!ownerId) throw new Error('Owner Id is required')
    const existing = await this.adapter.getKeyById(keyId)
    if (!existing) return false
    if ((existing as any).ownerId !== ownerId) return false
    return this.adapter.deleteKey(keyId)
  }

  async validateKey(keyValue: string): Promise<SanitizedApiKeyRecord | null> {
    if (!keyValue) return null
    const apiKey = await this.adapter.getKeyByValue(keyValue)
    if (!apiKey) return null
    if (!apiKey.isActive) return null
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null

    const now = new Date()
    await this.adapter.updateKey(apiKey.id, {
      ...apiKey,
      lastUsedAt: now.toISOString(),
    })
    const { key: _hidden, ...rest } = apiKey
    return rest
  }

  async checkRateLimit(keyId: string, override?: RateLimitConfig): Promise<boolean> {
    if (!keyId) return false
    const config = override ?? this.rateLimit
    return this.adapter.checkRateLimit(keyId, config)
  }
}

export default ApiKeyManager
