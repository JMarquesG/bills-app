import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

let sessionKey: Buffer | null = null

export function setSessionKeyFromPassword(password: string, saltHex: string) {
  const salt = Buffer.from(saltHex, 'hex')
  // Derive a 32-byte key for AES-256
  sessionKey = scryptSync(password, salt, 32)
}

export function clearSessionKey() {
  sessionKey = null
}

export function hasSessionKey(): boolean {
  return !!sessionKey
}

export function encryptSecret(plainText: string): { iv: string; cipherText: string; algo: string } {
  if (!sessionKey) throw new Error('LOCKED')
  const iv = randomBytes(12) // GCM recommended 12 bytes
  const cipher = createCipheriv('aes-256-gcm', sessionKey, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Store algo so we can evolve later if needed
  const payload = Buffer.concat([encrypted, tag])
  return { iv: iv.toString('base64'), cipherText: payload.toString('base64'), algo: 'aes-256-gcm' }
}

export function decryptSecret(ivB64: string, cipherTextB64: string): string {
  if (!sessionKey) throw new Error('LOCKED')
  const iv = Buffer.from(ivB64, 'base64')
  const payload = Buffer.from(cipherTextB64, 'base64')
  const tag = payload.subarray(payload.length - 16)
  const encrypted = payload.subarray(0, payload.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', sessionKey, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}


