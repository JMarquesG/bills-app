import { ipcMain } from 'electron'
import { createHash, randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { client } from '@bills/db'

const scryptAsync = promisify(scrypt)

ipcMain.handle('app:getStatus', async () => {
  try {
    console.log('📡 IPC: app:getStatus called')
    const result = await client.query('SELECT data_root, bills_root, expenses_root, security FROM setting WHERE id = 1')
    console.log('📊 Query result:', result.rows)
    const row = result.rows[0] as { data_root?: string; bills_root?: string; expenses_root?: string; security?: string } | undefined
    
    // Check if we have configuration - prefer data_root, fallback to legacy
    const hasSettings = !!(row?.data_root || (row?.bills_root && row?.expenses_root))
    let hasPassword = false
    
    console.log('🔍 Configuration check:')
    console.log('  - data_root:', row?.data_root)
    console.log('  - bills_root:', row?.bills_root)
    console.log('  - expenses_root:', row?.expenses_root)
    console.log('  - hasSettings:', hasSettings)
    
    if (row?.security) {
      try {
        const security = JSON.parse(row.security)
        hasPassword = security.hasPassword === true
        console.log('  - security config found, hasPassword:', hasPassword)
      } catch (error) {
        console.log('  - security config invalid:', error)
        // Invalid JSON, treat as no password
      }
    } else {
      console.log('  - no security config found')
    }
    
    const status = { hasSettings, hasPassword, dataRoot: row?.data_root }
    console.log('✅ Returning status:', status)
    return status
  } catch (error) {
    console.error('❌ Error in getStatus:', error)
    return { error: { code: 'GET_STATUS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('auth:setPassword', async (_, plainPassword: string | null) => {
  try {
    let securityData = null
    
    if (plainPassword) {
      const salt = randomBytes(16).toString('hex')
      const hash = await scryptAsync(plainPassword, salt, 32)
      
      securityData = JSON.stringify({
        hasPassword: true,
        salt,
        hash: (hash as Buffer).toString('hex')
      })
    }
    
    // Upsert setting row
    await client.query(`
      INSERT INTO setting (id, security, created_at, updated_at) 
      VALUES (1, $1, current_timestamp, current_timestamp)
      ON CONFLICT (id) DO UPDATE SET 
        security = $1, 
        updated_at = current_timestamp
    `, [securityData])
    
    return { ok: true }
  } catch (error) {
    return { error: { code: 'SET_PASSWORD_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('auth:changePassword', async (_, currentPassword: string, newPassword: string | null) => {
  try {
    // First verify current password
    const verifyResult = await client.query('SELECT security FROM setting WHERE id = 1')
    const settings = verifyResult.rows[0] as any
    
    if (!settings?.security) {
      return { error: { code: 'NO_PASSWORD_SET', message: 'No password currently set' } }
    }
    
    const security = JSON.parse(settings.security)
    if (!security.hasPassword || !security.salt || !security.hash) {
      return { error: { code: 'INVALID_SECURITY', message: 'Invalid security configuration' } }
    }
    
    // Verify current password
    const hash = await scryptAsync(currentPassword, security.salt, 32)
    const isValid = (hash as Buffer).toString('hex') === security.hash
    
    if (!isValid) {
      return { error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' } }
    }
    
    // Set new password (or remove if null)
    let newSecurityData = null
    if (newPassword) {
      const newSalt = randomBytes(16).toString('hex')
      const newHash = await scryptAsync(newPassword, newSalt, 32)
      
      newSecurityData = JSON.stringify({
        hasPassword: true,
        salt: newSalt,
        hash: (newHash as Buffer).toString('hex')
      })
    }
    
    await client.query(`
      UPDATE setting SET security = $1, updated_at = current_timestamp WHERE id = 1
    `, [newSecurityData])
    
    return { ok: true }
  } catch (error) {
    return { error: { code: 'CHANGE_PASSWORD_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('auth:verifyPassword', async (_, plainPassword: string) => {
  try {
    const result = await client.query('SELECT security FROM setting WHERE id = 1')
    const row = result.rows[0] as { security?: string } | undefined
    
    if (!row?.security) {
      return { valid: false }
    }
    
    const security = JSON.parse(row.security)
    if (!security.hasPassword || !security.salt || !security.hash) {
      return { valid: false }
    }
    
    const hash = await scryptAsync(plainPassword, security.salt, 32)
    const isValid = (hash as Buffer).toString('hex') === security.hash
    
    return { valid: isValid }
  } catch (error) {
    return { error: { code: 'VERIFY_PASSWORD_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})
