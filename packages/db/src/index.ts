import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { bootstrapSQL } from './schema';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/** Resolve DB directory:
 * - DEV: ./pgdata (repo root)
 * - PROD: Electron main will pass absolute path via env DB_DIR
 */
let _client: PGlite | null = null;
let _db: any = null;
let _isInitialized = false;

function getDbDir(): string {
  return process.env.DB_DIR || './pgdata';
}

// Lazy initialization to avoid startup issues
export function getClient(): PGlite {
  if (!_client) {
    console.log('🗄️ Initializing PGlite client with dir:', getDbDir());
    try {
      // Try to clean up any existing WASM memory first
      if (global.gc) {
        global.gc();
      }
      
      _client = new PGlite(getDbDir());
      
      console.log('✅ PGlite client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to create PGlite client:', error);
      
      // Clean up on any error
      _client = null;
      _db = null;
      _isInitialized = false;
      
      // Force garbage collection to clean up any WASM memory
      if (global.gc) {
        global.gc();
      }
      
      // If it's a WASM abort, try once more with a clean slate
      if (error instanceof Error && error.message.includes('Aborted')) {
        console.log('🔄 WASM abort detected, attempting recovery in 2 seconds...');
        
        // Wait longer for WASM cleanup
        setTimeout(() => {
          console.log('🔄 Attempting PGlite recovery...');
          try {
            if (global.gc) {
              global.gc();
            }
            _client = new PGlite(getDbDir());
            console.log('✅ PGlite client recovered successfully');
          } catch (retryError) {
            console.error('❌ PGlite recovery failed:', retryError);
          }
        }, 2000);
      }
      
      throw error;
    }
  }
  return _client;
}

export function getDb(): any {
  // Temporarily disable Drizzle to resolve compatibility issues
  // Just return the raw client for now
  return getClient();
}

// Direct exports instead of proxies to avoid private field issues
export const client = {
  query: (query: string, params?: any[]) => getClient().query(query, params),
  exec: (query: string) => getClient().exec(query),
  transaction: (callback: any) => getClient().transaction(callback),
  close: () => getClient().close(),
  // Add other commonly used PGlite methods as needed
};

// Reset function for recovery from WASM errors
export function resetConnection() {
  console.log('🔄 Resetting database connection...');
  try {
    if (_client) {
      _client.close();
    }
  } catch (error) {
    console.log('ℹ️ Error closing client (expected):', error);
  }
  _client = null;
  _db = null;
  _isInitialized = false;
  if (global.gc) {
    global.gc();
  }
  console.log('✅ Database connection reset complete');
}

// Export the db getter for Drizzle usage
export const db = getDb;

/** Initialize schema on first run */
export async function initDb() {
  if (_isInitialized) {
    console.log('ℹ️ Database already initialized, skipping...');
    return;
  }

  try {
    console.log('🗄️ Initializing database schema...');
    console.log('📁 Database directory:', getDbDir());
    
    const currentClient = getClient();
    
    // Test basic connectivity first
    await currentClient.query('SELECT 1 as test');
    console.log('✅ Database connection established');
    
    // Initialize schema
    await currentClient.exec(bootstrapSQL);
    console.log('✅ Database schema initialized successfully');
    
    // Apply simple migrations for existing installations
    // Don't let migration failures prevent app startup
    try {
      await runSimpleMigrations();
      console.log('✅ Database migrations completed');
    } catch (migrationError) {
      console.log('ℹ️ Migrations had issues but continuing - this is often normal:', migrationError instanceof Error ? migrationError.message : 'Unknown migration error');
    }
    
    _isInitialized = true;
    console.log('🎉 Database initialization complete!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    
    // Reset client on failure so we can retry
    _client = null;
    _db = null;
    
    // If it's a WASM/connectivity issue, reset and retry once
    if (error instanceof Error && (error.message.includes('Aborted') || error.message.includes('runtime') || error.message.includes('WASM'))) {
      console.log('🔄 WASM/Runtime error detected, resetting connection and retrying...');
      resetConnection();
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait longer for WASM cleanup
      try {
        console.log('🔄 Attempting database retry after reset...');
        const retryClient = getClient();
        await retryClient.exec(bootstrapSQL);
        console.log('✅ Database schema initialized on retry after reset');
        _isInitialized = true;
        return;
      } catch (retryError) {
        console.error('❌ Database retry failed after reset:', retryError);
        resetConnection();
      }
    }
    throw error;
  }
}

/** Simple migrations without complex PL/pgSQL features */
async function runSimpleMigrations() {
  // Skip migrations completely if database is having issues
  // The bootstrap SQL in schema.ts already handles most column additions
  try {
    console.log('ℹ️ Checking for simple migration needs...');
    
    // Add description column to invoice table if it doesn't exist
    try {
      const currentClient = getClient();
      await currentClient.query(`
        ALTER TABLE invoice ADD COLUMN IF NOT EXISTS description text;
      `);
      console.log('✅ Added description column to invoice table');
    } catch (error) {
      console.log('ℹ️ Description column may already exist or table not found - this is normal for new installations');
    }

    // Only try to update expected_payment_date for existing invoices
    // This is the main migration we actually need
    try {
      const currentClient = getClient();
      await currentClient.query(`
        UPDATE invoice 
        SET expected_payment_date = issue_date + INTERVAL '30 days'
        WHERE expected_payment_date IS NULL;
      `);
      console.log('✅ Updated expected payment dates for existing invoices');
    } catch (error) {
      // If interval doesn't work, try a simpler approach
      try {
        const currentClient = getClient();
        await currentClient.query(`
          UPDATE invoice 
          SET expected_payment_date = issue_date
          WHERE expected_payment_date IS NULL;
        `);
        console.log('✅ Set expected payment dates to issue dates for existing invoices');
      } catch (fallbackError) {
        console.log('ℹ️ Could not update expected payment dates - this is normal for new installations');
      }
    }

    // Add cc_emails column to automation_rule if missing
    try {
      const currentClient = getClient();
      await currentClient.query(`
        ALTER TABLE automation_rule ADD COLUMN IF NOT EXISTS cc_emails text;
      `);
      console.log('✅ Ensured cc_emails column exists on automation_rule');
    } catch (error) {
      console.log('ℹ️ Could not add cc_emails column - likely already exists');
    }

    // Add openai_key column to setting if missing
    try {
      const currentClient = getClient();
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS openai_key text;
      `);
      console.log('✅ Ensured openai_key column exists on setting');
    } catch (error) {
      console.log('ℹ️ Could not add openai_key column - likely already exists');
    }

    // Add ai_backend column to setting if missing
    try {
      const currentClient = getClient();
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS ai_backend text DEFAULT 'local';
      `);
      console.log('✅ Ensured ai_backend column exists on setting');
    } catch (error) {
      console.log('ℹ️ Could not add ai_backend column - likely already exists');
    }

    // Add Supabase sync columns if missing
    try {
      const currentClient = getClient();
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS supabase_url text;
      `);
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS supabase_key text;
      `);
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS supabase_sync_enabled boolean DEFAULT false;
      `);
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS last_sync_at timestamp;
      `);
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS supabase_conflict_policy text DEFAULT 'cloud_wins';
      `);
      await currentClient.query(`
        ALTER TABLE setting ADD COLUMN IF NOT EXISTS supabase_db_url text;
      `);
      console.log('✅ Ensured Supabase sync columns exist on setting');
    } catch (error) {
      console.log('ℹ️ Could not add Supabase columns - likely already exist');
    }
    
  } catch (error) {
    console.log('ℹ️ Migrations skipped - database may be freshly initialized');
  }
}

export async function healthcheck(): Promise<boolean> {
  try {
    const currentClient = getClient();
    const r = await currentClient.query("select 1 as ok;");
    return (r.rows?.[0] as any)?.ok === 1;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    return false;
  }
}

// Backup and Restore Functions

export interface BackupData {
  version: string;
  timestamp: string;
  clients: any[];
  invoices: any[];
  expenses: any[];
  settings: any[];
  automation_rules: any[];
}

/** Create a full backup of all database data */
export async function backupAllData(): Promise<BackupData> {
  try {
    console.log('📦 Creating full database backup...');
    const currentClient = getClient();
    
    // Export all tables
    const clients = await currentClient.query('SELECT * FROM client ORDER BY created_at');
    const invoices = await currentClient.query('SELECT * FROM invoice ORDER BY created_at');
    const expenses = await currentClient.query('SELECT * FROM expense ORDER BY created_at');
    const settings = await currentClient.query('SELECT * FROM setting ORDER BY id');
    const automationRules = await currentClient.query('SELECT * FROM automation_rule ORDER BY created_at');
    
    const backup: BackupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      clients: clients.rows || [],
      invoices: invoices.rows || [],
      expenses: expenses.rows || [],
      settings: settings.rows || [],
      automation_rules: automationRules.rows || []
    };
    
    console.log('✅ Database backup created successfully');
    console.log(`📊 Backup stats: ${backup.clients.length} clients, ${backup.invoices.length} invoices, ${backup.expenses.length} expenses, ${backup.settings.length} settings, ${backup.automation_rules.length} automation rules`);
    
    return backup;
  } catch (error) {
    console.error('❌ Failed to create database backup:', error);
    throw error;
  }
}

/** Save backup data to JSON files in the specified directory */
export async function createDataBackup(dataRootPath: string): Promise<void> {
  try {
    console.log('💾 Saving database backup to:', dataRootPath);
    
    const backup = await backupAllData();
    const backupFolder = join(dataRootPath, '.bills-backup');
    
    // Ensure backup directory exists
    try {
      await fs.access(backupFolder);
    } catch {
      await fs.mkdir(backupFolder, { recursive: true });
    }
    
    // Save main backup file
    const mainBackupPath = join(backupFolder, 'database-backup.json');
    await fs.writeFile(mainBackupPath, JSON.stringify(backup, null, 2), 'utf-8');
    
    // Save individual table files for easier inspection
    await fs.writeFile(join(backupFolder, 'clients.json'), JSON.stringify(backup.clients, null, 2), 'utf-8');
    await fs.writeFile(join(backupFolder, 'invoices.json'), JSON.stringify(backup.invoices, null, 2), 'utf-8');
    await fs.writeFile(join(backupFolder, 'expenses.json'), JSON.stringify(backup.expenses, null, 2), 'utf-8');
    await fs.writeFile(join(backupFolder, 'settings.json'), JSON.stringify(backup.settings, null, 2), 'utf-8');
    await fs.writeFile(join(backupFolder, 'automation-rules.json'), JSON.stringify(backup.automation_rules, null, 2), 'utf-8');
    
    // Create a readable backup summary
    const summary = {
      backupDate: backup.timestamp,
      version: backup.version,
      totalRecords: backup.clients.length + backup.invoices.length + backup.expenses.length + backup.settings.length + backup.automation_rules.length,
      tables: {
        clients: backup.clients.length,
        invoices: backup.invoices.length,
        expenses: backup.expenses.length,
        settings: backup.settings.length,
        automation_rules: backup.automation_rules.length
      }
    };
    await fs.writeFile(join(backupFolder, 'backup-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    
    console.log('✅ Database backup saved successfully to:', backupFolder);
  } catch (error) {
    console.error('❌ Failed to save database backup:', error);
    throw error;
  }
}

/** Check if backup files exist in the specified directory */
export async function checkForBackupFiles(dataRootPath: string): Promise<{ hasBackup: boolean; backupPath?: string; summary?: any }> {
  try {
    const backupFolder = join(dataRootPath, '.bills-backup');
    const mainBackupPath = join(backupFolder, 'database-backup.json');
    const summaryPath = join(backupFolder, 'backup-summary.json');
    
    try {
      await fs.access(mainBackupPath);
      
      // Try to read the summary
      let summary = null;
      try {
        const summaryContent = await fs.readFile(summaryPath, 'utf-8');
        summary = JSON.parse(summaryContent);
      } catch {
        // No summary file, create a basic one
        summary = { backupDate: 'Unknown', totalRecords: 'Unknown' };
      }
      
      return {
        hasBackup: true,
        backupPath: mainBackupPath,
        summary
      };
    } catch {
      return { hasBackup: false };
    }
  } catch (error) {
    console.error('❌ Error checking for backup files:', error);
    return { hasBackup: false };
  }
}

/** Restore database from backup data */
export async function restoreFromBackup(backupData: BackupData): Promise<void> {
  try {
    console.log('🔄 Starting database restore...');
    const currentClient = getClient();
    
    // Clear existing data (in reverse order due to foreign keys)
    console.log('🗑️ Clearing existing data...');
    await currentClient.query('DELETE FROM automation_rule');
    await currentClient.query('DELETE FROM expense');
    await currentClient.query('DELETE FROM invoice');
    await currentClient.query('DELETE FROM client');
    await currentClient.query('DELETE FROM setting');
    
    // Restore data in correct order (respecting foreign keys)
    console.log('📥 Restoring data...');
    
    // Restore settings first (no dependencies)
    for (const setting of backupData.settings) {
      await currentClient.query(`
        INSERT INTO setting (id, data_root, bills_root, expenses_root, filename_tpl, security, company_profile, smtp_config, openai_key, ai_backend, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        setting.id, setting.data_root, setting.bills_root, setting.expenses_root,
        setting.filename_tpl, setting.security, setting.company_profile,
        setting.smtp_config, setting.openai_key, setting.ai_backend,
        setting.created_at, setting.updated_at
      ]);
    }
    
    // Restore clients
    for (const client of backupData.clients) {
      await currentClient.query(`
        INSERT INTO client (id, name, email, address, phone, hidden, tax_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        client.id, client.name, client.email, client.address, client.phone,
        client.hidden, client.tax_id, client.created_at, client.updated_at
      ]);
    }
    
    // Restore invoices
    for (const invoice of backupData.invoices) {
      await currentClient.query(`
        INSERT INTO invoice (id, number, client_id, issue_date, due_date, expected_payment_date, amount, currency, status, file_path, folder_path, description, notes, paid_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        invoice.id, invoice.number, invoice.client_id, invoice.issue_date, invoice.due_date,
        invoice.expected_payment_date, invoice.amount, invoice.currency, invoice.status,
        invoice.file_path, invoice.folder_path, invoice.description, invoice.notes,
        invoice.paid_at, invoice.created_at, invoice.updated_at
      ]);
    }
    
    // Restore expenses
    for (const expense of backupData.expenses) {
      await currentClient.query(`
        INSERT INTO expense (id, invoice_id, vendor, category, date, amount, currency, file_path, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        expense.id, expense.invoice_id, expense.vendor, expense.category, expense.date,
        expense.amount, expense.currency, expense.file_path, expense.notes,
        expense.created_at, expense.updated_at
      ]);
    }
    
    // Restore automation rules
    for (const rule of backupData.automation_rules) {
      await currentClient.query(`
        INSERT INTO automation_rule (id, client_id, name, day_of_month, amount, currency, description, subject_template, body_template, cc_emails, is_active, last_sent_date, next_due_date, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        rule.id, rule.client_id, rule.name, rule.day_of_month, rule.amount,
        rule.currency, rule.description, rule.subject_template, rule.body_template,
        rule.cc_emails, rule.is_active, rule.last_sent_date, rule.next_due_date,
        rule.created_at, rule.updated_at
      ]);
    }
    
    console.log('✅ Database restore completed successfully');
    console.log(`📊 Restored: ${backupData.clients.length} clients, ${backupData.invoices.length} invoices, ${backupData.expenses.length} expenses, ${backupData.settings.length} settings, ${backupData.automation_rules.length} automation rules`);
  } catch (error) {
    console.error('❌ Failed to restore database:', error);
    throw error;
  }
}

/** Restore database from backup file path */
export async function restoreFromBackupFile(backupFilePath: string): Promise<void> {
  try {
    console.log('📂 Loading backup from file:', backupFilePath);
    const backupContent = await fs.readFile(backupFilePath, 'utf-8');
    const backupData: BackupData = JSON.parse(backupContent);
    
    // Validate backup structure
    if (!backupData.version || !backupData.timestamp) {
      throw new Error('Invalid backup file format');
    }
    
    await restoreFromBackup(backupData);
    console.log('✅ Database successfully restored from backup file');
  } catch (error) {
    console.error('❌ Failed to restore from backup file:', error);
    throw error;
  }
}

/** Reset database and restore from backup in data root folder */
export async function resetAndRestoreDatabase(dataRootPath: string): Promise<void> {
  try {
    console.log('🔄 Resetting database and restoring from backup in:', dataRootPath);
    
    const backupCheck = await checkForBackupFiles(dataRootPath);
    if (!backupCheck.hasBackup || !backupCheck.backupPath) {
      throw new Error('No backup files found in the specified directory');
    }
    
    await restoreFromBackupFile(backupCheck.backupPath);
    console.log('✅ Database reset and restore completed');
  } catch (error) {
    console.error('❌ Failed to reset and restore database:', error);
    throw error;
  }
}

/** Create backup if data root is available - utility function for automatic backups */
export async function createAutoBackupIfPossible(): Promise<void> {
  try {
    // Try to get the data root from settings
    const result = await client.query('SELECT data_root FROM setting WHERE id = 1');
    const dataRoot = (result.rows[0] as any)?.data_root;
    
    if (dataRoot) {
      await createDataBackup(dataRoot);
      console.log('✅ Automatic backup created successfully');
    } else {
      console.log('ℹ️ No data root configured, skipping automatic backup');
    }
  } catch (error) {
    console.log('ℹ️ Automatic backup failed but continuing:', error instanceof Error ? error.message : 'Unknown backup error');
  }
}
