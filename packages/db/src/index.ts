import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { bootstrapSQL } from './schema';

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
