export type ApiKeyRecord = {
  id: string
  key: string
  ownerId: string
  name: string
  permissions: Record<string, unknown>
  rateLimit?: RateLimitConfig
  isActive: boolean
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  metadata: Record<string, unknown>
}

export type SanitizedApiKeyRecord = Omit<ApiKeyRecord, 'key'>

export type RateLimitConfig = {
  windowMs: number
  maxRequests: number
}

export interface StorageAdapter {
  saveKey(apiKey: ApiKeyRecord): Promise<ApiKeyRecord>
  getKeyById(keyId: string): Promise<ApiKeyRecord | null>
  getKeyByValue(keyValue: string): Promise<ApiKeyRecord | null>
  getKeysByownerId(ownerId: string): Promise<ApiKeyRecord[]>
  updateKey(keyId: string, updatedKey: ApiKeyRecord): Promise<ApiKeyRecord | null>
  deleteKey(keyId: string): Promise<boolean>
  checkRateLimit(keyId: string, rateLimit: RateLimitConfig): Promise<boolean>
}

