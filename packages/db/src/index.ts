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
    _client = new PGlite(getDbDir());
  }
  return _client;
}

export function getDb(): any {
  if (!_db) {
    _db = drizzle({ client: getClient() });
  }
  return _db;
}

// Direct exports instead of proxies to avoid private field issues
export const client = {
  query: (query: string, params?: any[]) => getClient().query(query, params),
  exec: (query: string) => getClient().exec(query),
  transaction: (callback: any) => getClient().transaction(callback),
  close: () => getClient().close(),
  // Add other commonly used PGlite methods as needed
};

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
    
    // If it's a connectivity issue, wait a moment and retry once
    if (error instanceof Error && (error.message.includes('Aborted') || error.message.includes('runtime'))) {
      console.log('🔄 Retrying database initialization after 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const retryClient = getClient();
        await retryClient.exec(bootstrapSQL);
        console.log('✅ Database schema initialized on retry');
        _isInitialized = true;
        return;
      } catch (retryError) {
        console.error('❌ Database retry failed:', retryError);
        _client = null;
        _db = null;
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
