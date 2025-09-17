import { ipcMain, dialog, app } from 'electron'
import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import { client } from '@bills/db'

const companyProfileSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  iban: z.string().optional(),
  swift: z.string().optional()
})

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  password: z.string().min(1)
})

// Helper functions
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath)
  } catch {
    await fs.mkdir(dirPath, { recursive: true })
  }
}

async function getDbPath(): Promise<string> {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    return process.env.DB_DIR || join(process.cwd(), 'pgdata')
  }
  return join(app.getPath('userData'), 'pgdata')
}

async function getConfigPath(): Promise<string> {
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    return join(process.cwd(), 'bills-app.config.json')
  }
  return join(app.getPath('userData'), 'bills-app.config.json')
}

async function getDataRoot(): Promise<string | null> {
  try {
    const result = await client.query('SELECT data_root FROM setting WHERE id = 1')
    return (result.rows[0] as any)?.data_root || null
  } catch (error) {
    return null
  }
}

async function getBillsFolder(dataRoot: string): Promise<string> {
  return join(dataRoot, 'bills')
}

async function getExpensesFolder(dataRoot: string): Promise<string> {
  return join(dataRoot, 'expenses')
}

async function migrateDataToNewFolder(oldDataRoot: string | null, newDataRoot: string): Promise<void> {
  if (!oldDataRoot || oldDataRoot === newDataRoot) return

  console.log('🔄 Migrating data from', oldDataRoot, 'to', newDataRoot)
  
  const oldBillsFolder = join(oldDataRoot, 'bills')
  const oldExpensesFolder = join(oldDataRoot, 'expenses')
  const newBillsFolder = await getBillsFolder(newDataRoot)
  const newExpensesFolder = await getExpensesFolder(newDataRoot)

  // Ensure new directories exist
  await ensureDirectoryExists(newBillsFolder)
  await ensureDirectoryExists(newExpensesFolder)

  // Copy bills if old folder exists
  try {
    await fs.access(oldBillsFolder)
    const billFiles = await fs.readdir(oldBillsFolder, { recursive: true })
    for (const file of billFiles) {
      const oldPath = join(oldBillsFolder, file as string)
      const newPath = join(newBillsFolder, file as string)
      const stat = await fs.stat(oldPath)
      if (stat.isFile()) {
        await ensureDirectoryExists(dirname(newPath))
        await fs.copyFile(oldPath, newPath)
      }
    }
  } catch (error) {
    console.log('No bills folder to migrate or error:', error)
  }

  // Copy expenses if old folder exists
  try {
    await fs.access(oldExpensesFolder)
    const expenseFiles = await fs.readdir(oldExpensesFolder, { recursive: true })
    for (const file of expenseFiles) {
      const oldPath = join(oldExpensesFolder, file as string)
      const newPath = join(newExpensesFolder, file as string)
      const stat = await fs.stat(oldPath)
      if (stat.isFile()) {
        await ensureDirectoryExists(dirname(newPath))
        await fs.copyFile(oldPath, newPath)
      }
    }
  } catch (error) {
    console.log('No expenses folder to migrate or error:', error)
  }

  // Update file paths in database
  await client.query(`
    UPDATE invoice 
    SET 
      file_path = REPLACE(file_path, $1, $2),
      folder_path = REPLACE(folder_path, $1, $2),
      updated_at = current_timestamp
    WHERE file_path LIKE $1 || '%' OR folder_path LIKE $1 || '%'
  `, [oldDataRoot, newDataRoot])

  await client.query(`
    UPDATE expense 
    SET 
      file_path = REPLACE(file_path, $1, $2),
      updated_at = current_timestamp
    WHERE file_path LIKE $1 || '%'
  `, [oldDataRoot, newDataRoot])

  console.log('✅ Data migration completed')
}

async function saveConfigFile(dataRoot: string): Promise<void> {
  const configPath = await getConfigPath()
  const config = {
    version: '1.0.0',
    dataRoot,
    billsFolder: await getBillsFolder(dataRoot),
    expensesFolder: await getExpensesFolder(dataRoot),
    lastUpdated: new Date().toISOString()
  }
  
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('📄 Config file saved to:', configPath)
    
    // Also save a copy in the data root for backup
    const dataConfigPath = join(dataRoot, 'bills-app.config.json')
    await fs.writeFile(dataConfigPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('📄 Backup config file saved to:', dataConfigPath)
  } catch (error) {
    console.error('❌ Failed to save config file:', error)
    throw error
  }
}

// IPC Handlers
ipcMain.handle('settings:getDataRoot', async () => {
  try {
    const result = await client.query('SELECT data_root, bills_root, expenses_root FROM setting WHERE id = 1')
    const row = result.rows[0] as { data_root?: string; bills_root?: string; expenses_root?: string } | undefined
    
    // Migration: if we have old separate folders but no data_root, use bills_root as data_root
    if (!row?.data_root && row?.bills_root) {
      const dataRoot = dirname(row.bills_root) // Go up one level from bills folder
      await client.query('UPDATE setting SET data_root = $1 WHERE id = 1', [dataRoot])
      await saveConfigFile(dataRoot)
      return { path: dataRoot }
    }
    
    return { path: row?.data_root || null }
  } catch (error) {
    return { error: { code: 'DB_ERROR', message: 'Failed to get data root' } }
  }
})

ipcMain.handle('settings:getBillsRoot', async () => {
  try {
    const dataRoot = await getDataRoot()
    if (!dataRoot) {
      return { path: null }
    }
    return { path: await getBillsFolder(dataRoot) }
  } catch (error) {
    return { error: { code: 'DB_ERROR', message: 'Failed to get bills root' } }
  }
})

ipcMain.handle('settings:getExpensesRoot', async () => {
  try {
    const dataRoot = await getDataRoot()
    if (!dataRoot) {
      return { path: null }
    }
    return { path: await getExpensesFolder(dataRoot) }
  } catch (error) {
    return { error: { code: 'DB_ERROR', message: 'Failed to get expenses root' } }
  }
})

ipcMain.handle('folder:pickDataRoot', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Bills App Data Folder',
      properties: ['openDirectory', 'createDirectory'],
      message: 'Choose where to store your bills and expenses data'
    })
    
    if (result.canceled) {
      return { canceled: true }
    }
    
    return { canceled: false, path: result.filePaths[0] }
  } catch (error) {
    return { error: { code: 'DIALOG_ERROR', message: 'Failed to open folder picker' } }
  }
})

// Legacy handlers for backwards compatibility
ipcMain.handle('folder:pickBillsRoot', async () => {
  return ipcMain.emit('folder:pickDataRoot')
})

ipcMain.handle('folder:pickExpensesRoot', async () => {
  return ipcMain.emit('folder:pickDataRoot')
})

ipcMain.handle('folder:ensureDir', async (_, dirPath: string) => {
  try {
    const validatedPath = z.string().min(1).parse(dirPath)
    await ensureDirectoryExists(validatedPath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
})

ipcMain.handle('settings:save', async (_, data: { dataRoot?: string; billsRoot?: string; expensesRoot?: string }) => {
  try {
    console.log('💾 IPC: settings:save called with data:', data)
    
    const oldDataRoot = await getDataRoot()
    console.log('🔍 Current data root:', oldDataRoot)
    
    const newDataRoot = data.dataRoot || null
    
    // If we have a new data root, migrate data
    if (newDataRoot && oldDataRoot !== newDataRoot) {
      console.log('🔄 Migrating data from', oldDataRoot, 'to', newDataRoot)
      await migrateDataToNewFolder(oldDataRoot, newDataRoot)
    }
    
    // For new single-folder approach
    if (data.dataRoot) {
      console.log('📁 Setting up single folder approach for:', data.dataRoot)
      const billsFolder = await getBillsFolder(data.dataRoot)
      const expensesFolder = await getExpensesFolder(data.dataRoot)
      
      console.log('📁 Bills folder:', billsFolder)
      console.log('📁 Expenses folder:', expensesFolder)
      
      // Ensure subfolders exist
      await ensureDirectoryExists(billsFolder)
      await ensureDirectoryExists(expensesFolder)
      
      console.log('💾 Saving to database...')
      
      // Use simpler SQL that's more compatible with PGlite
      const now = new Date().toISOString()
      
      // Use UPSERT (ON CONFLICT) which is more reliable for PGlite
      try {
        await client.query(`
          INSERT INTO setting (id, data_root, bills_root, expenses_root, created_at, updated_at)
          VALUES (1, $1, $2, $3, $4, $4)
          ON CONFLICT (id) DO UPDATE SET 
            data_root = EXCLUDED.data_root,
            bills_root = EXCLUDED.bills_root,
            expenses_root = EXCLUDED.expenses_root,
            updated_at = EXCLUDED.updated_at
        `, [data.dataRoot, billsFolder, expensesFolder, now])
      } catch (upsertError) {
        console.log('UPSERT failed, trying separate update/insert:', upsertError)
        // Fallback to separate operations
        try {
          const updateResult = await client.query(`
            UPDATE setting 
            SET data_root = $1, bills_root = $2, expenses_root = $3, updated_at = $4
            WHERE id = 1
          `, [data.dataRoot, billsFolder, expensesFolder, now])
          
          // Check if we need to insert (PGlite compatible way)
          if (!updateResult.rows || updateResult.rows.length === 0) {
            await client.query(`
              INSERT INTO setting (id, data_root, bills_root, expenses_root, created_at, updated_at)
              VALUES (1, $1, $2, $3, $4, $4)
            `, [data.dataRoot, billsFolder, expensesFolder, now])
          }
        } catch (fallbackError) {
          console.error('Settings save failed completely:', fallbackError)
          throw fallbackError
        }
      }
      
      console.log('📄 Saving config file...')
      // Save config file
      await saveConfigFile(data.dataRoot)
      console.log('✅ Configuration saved successfully!')
    } else {
      console.log('📁 Using legacy separate folders approach')
      // Legacy: separate folders (backwards compatibility)
      const billsRoot = data.billsRoot || null
      const expensesRoot = data.expensesRoot || null
      
      // Use simpler SQL that's more compatible with PGlite
      const now = new Date().toISOString()
      
      // First, try to update existing record
      const updateResult = await client.query(`
        UPDATE setting 
        SET bills_root = COALESCE($1, bills_root), 
            expenses_root = COALESCE($2, expenses_root), 
            updated_at = $3
        WHERE id = 1
      `, [billsRoot, expensesRoot, now])
      
      // If no rows were affected, insert new record
      if (updateResult.affectedRows === 0) {
        await client.query(`
          INSERT INTO setting (id, bills_root, expenses_root, created_at, updated_at)
          VALUES (1, $1, $2, $3, $3)
        `, [billsRoot, expensesRoot, now])
      }
    }
    
    return { ok: true }
  } catch (error) {
    console.error('❌ Failed to save settings:', error)
    return { error: { code: 'SAVE_SETTINGS_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('settings:reconfigure', async (_, newDataRoot: string) => {
  try {
    const oldDataRoot = await getDataRoot()
    
    // Migrate data if needed
    if (oldDataRoot && oldDataRoot !== newDataRoot) {
      await migrateDataToNewFolder(oldDataRoot, newDataRoot)
    }
    
    const billsFolder = await getBillsFolder(newDataRoot)
    const expensesFolder = await getExpensesFolder(newDataRoot)
    
    // Ensure new subfolders exist
    await ensureDirectoryExists(billsFolder)
    await ensureDirectoryExists(expensesFolder)
    
    // Update settings using simple SQL compatible with PGlite
    const now = new Date().toISOString()
    
    // First, try to update existing record
    const updateResult = await client.query(`
      UPDATE setting 
      SET data_root = $1, bills_root = $2, expenses_root = $3, updated_at = $4
      WHERE id = 1
    `, [newDataRoot, billsFolder, expensesFolder, now])
    
    // If no rows were affected, insert new record
    if (updateResult.affectedRows === 0) {
      await client.query(`
        INSERT INTO setting (id, data_root, bills_root, expenses_root, created_at, updated_at)
        VALUES (1, $1, $2, $3, $4, $4)
      `, [newDataRoot, billsFolder, expensesFolder, now])
    }
    
    // Save config file
    await saveConfigFile(newDataRoot)
    
    return { ok: true, billsFolder, expensesFolder }
  } catch (error) {
    return { error: { code: 'RECONFIGURE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Company profile (my data)
ipcMain.handle('settings:getCompanyProfile', async () => {
  try {
    const result = await client.query('SELECT company_profile FROM setting WHERE id = 1')
    const text = (result.rows?.[0] as any)?.company_profile as string | undefined
    return { profile: text ? JSON.parse(text) : null }
  } catch (error) {
    return { error: { code: 'GET_COMPANY_PROFILE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('settings:saveCompanyProfile', async (_e, profile: unknown) => {
  try {
    // Validate
    const parsed = companyProfileSchema.parse(profile)
    const text = JSON.stringify(parsed)
    // Use simple SQL compatible with PGlite
    const now = new Date().toISOString()
    
    // First, try to update existing record
    const updateResult = await client.query(`
      UPDATE setting 
      SET company_profile = $1, updated_at = $2
      WHERE id = 1
    `, [text, now])
    
    // If no rows were affected, insert new record
    if (updateResult.affectedRows === 0) {
      await client.query(`
        INSERT INTO setting (id, company_profile, created_at, updated_at)
        VALUES (1, $1, $2, $2)
      `, [text, now])
    }
    return { ok: true }
  } catch (error) {
    return { error: { code: 'SAVE_COMPANY_PROFILE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// Test handler to verify config file creation
ipcMain.handle('debug:checkConfigFile', async () => {
  try {
    const configPath = await getConfigPath()
    const dataRoot = await getDataRoot()
    
    let mainConfigExists = false
    let dataConfigExists = false
    let mainConfigContent = null
    let dataConfigContent = null
    
    try {
      await fs.access(configPath)
      mainConfigExists = true
      const content = await fs.readFile(configPath, 'utf-8')
      mainConfigContent = JSON.parse(content)
    } catch (error) {
      console.log('Main config file not found:', configPath)
    }
    
    if (dataRoot) {
      try {
        const dataConfigPath = join(dataRoot, 'bills-app.config.json')
        await fs.access(dataConfigPath)
        dataConfigExists = true
        const content = await fs.readFile(dataConfigPath, 'utf-8')
        dataConfigContent = JSON.parse(content)
      } catch (error) {
        console.log('Data config file not found in:', dataRoot)
      }
    }
    
    return {
      mainConfig: { exists: mainConfigExists, path: configPath, content: mainConfigContent },
      dataConfig: { exists: dataConfigExists, path: dataRoot ? join(dataRoot, 'bills-app.config.json') : null, content: dataConfigContent },
      dataRoot
    }
  } catch (error) {
    return { error: { code: 'CHECK_CONFIG_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

// New functions for handling existing config files
async function loadConfigFromFolder(folderPath: string): Promise<{ version: string; dataRoot: string; billsFolder: string; expensesFolder: string; lastUpdated: string } | null> {
  try {
    const configPath = join(folderPath, 'bills-app.config.json')
    await fs.access(configPath)
    const content = await fs.readFile(configPath, 'utf-8')
    const config = JSON.parse(content)
    
    // Validate config structure
    if (config.dataRoot && config.billsFolder && config.expensesFolder) {
      return config
    }
    return null
  } catch (error) {
    return null
  }
}

async function applyConfigFromFile(config: { dataRoot: string; billsFolder: string; expensesFolder: string }): Promise<void> {
  // Update database with the loaded configuration using simple SQL compatible with PGlite
  const now = new Date().toISOString()
  
  // First, try to update existing record
  const updateResult = await client.query(`
    UPDATE setting 
    SET data_root = $1, bills_root = $2, expenses_root = $3, updated_at = $4
    WHERE id = 1
  `, [config.dataRoot, config.billsFolder, config.expensesFolder, now])
  
  // If no rows were affected, insert new record
  if (updateResult.affectedRows === 0) {
    await client.query(`
      INSERT INTO setting (id, data_root, bills_root, expenses_root, created_at, updated_at)
      VALUES (1, $1, $2, $3, $4, $4)
    `, [config.dataRoot, config.billsFolder, config.expensesFolder, now])
  }
  
  console.log('✅ Configuration loaded from existing config file')
}

// IPC Handler to check if folder has existing config and load it
ipcMain.handle('folder:checkAndLoadConfig', async (_, folderPath: string) => {
  try {
    const validatedPath = z.string().min(1).parse(folderPath)
    
    // Check if config file exists in the selected folder
    const existingConfig = await loadConfigFromFolder(validatedPath)
    
    if (existingConfig) {
      console.log('📄 Found existing config in folder:', validatedPath)
      
      // Apply the existing configuration
      await applyConfigFromFile(existingConfig)
      
      // Update the main config file location as well
      await saveConfigFile(existingConfig.dataRoot)
      
      return {
        hasExistingConfig: true,
        config: existingConfig,
        autoLoaded: true
      }
    }
    
    return {
      hasExistingConfig: false,
      config: null,
      autoLoaded: false
    }
  } catch (error) {
    return { 
      error: { 
        code: 'CHECK_CONFIG_ERROR', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      } 
    }
  }
})

// Enhanced folder picker that automatically checks for existing config
ipcMain.handle('folder:pickDataRootWithConfigCheck', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Bills App Data Folder',
      properties: ['openDirectory', 'createDirectory'],
      message: 'Choose where to store your bills and expenses data'
    })
    
    if (result.canceled) {
      return { canceled: true }
    }
    
    const selectedPath = result.filePaths[0]
    
    // Check if the selected folder has an existing config file
    const configResult = await loadConfigFromFolder(selectedPath)
    
    if (configResult) {
      console.log('📄 Auto-loading existing configuration from:', selectedPath)
      
      // Automatically load the existing configuration
      await applyConfigFromFile(configResult)
      await saveConfigFile(configResult.dataRoot)
      
      return {
        canceled: false,
        path: selectedPath,
        hasExistingConfig: true,
        autoLoaded: true,
        config: configResult
      }
    }
    
    return {
      canceled: false,
      path: selectedPath,
      hasExistingConfig: false,
      autoLoaded: false
    }
  } catch (error) {
    return { 
      error: { 
        code: 'DIALOG_ERROR', 
        message: 'Failed to open folder picker' 
      } 
    }
  }
})

// SMTP configuration handlers
ipcMain.handle('settings:getSmtpConfig', async () => {
  try {
    const result = await client.query('SELECT smtp_config FROM setting WHERE id = 1')
    const text = (result.rows?.[0] as any)?.smtp_config as string | undefined
    return { config: text ? JSON.parse(text) : null }
  } catch (error) {
    return { error: { code: 'GET_SMTP_CONFIG_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

ipcMain.handle('settings:saveSmtpConfig', async (_e, config: unknown) => {
  try {
    // Validate
    const parsed = smtpConfigSchema.parse(config)
    const text = JSON.stringify(parsed)
    // Use simple SQL compatible with PGlite
    const now = new Date().toISOString()
    
    // First, try to update existing record
    const updateResult = await client.query(`
      UPDATE setting 
      SET smtp_config = $1, updated_at = $2
      WHERE id = 1
    `, [text, now])
    
    // If no rows were affected, insert new record
    if (updateResult.affectedRows === 0) {
      await client.query(`
        INSERT INTO setting (id, smtp_config, created_at, updated_at)
        VALUES (1, $1, $2, $2)
      `, [text, now])
    }
    return { ok: true }
  } catch (error) {
    return { error: { code: 'SAVE_SMTP_CONFIG_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } }
  }
})

export { getDataRoot, getBillsFolder, getExpensesFolder, ensureDirectoryExists, loadConfigFromFolder }
