import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * SQL Script Generator
 * 
 * This module generates a complete SQL script from all migration files
 * during build time. The generated script can be used to set up the
 * database schema on Supabase or any PostgreSQL-compatible database.
 */

interface MigrationFile {
  filename: string
  content: string
  order: number
}

/**
 * Read all migration files and combine them into a single SQL script
 */
export async function generateCompleteSQLScript(): Promise<string> {
  try {
    console.log('📝 Generating complete SQL script from migrations...')
    
    // Get the migrations directory path
    const migrationsDir = join(__dirname, '..', 'migrations')
    
    // Read all SQL files in the migrations directory
    const files = await fs.readdir(migrationsDir)
    const sqlFiles = files
      .filter(file => file.endsWith('.sql') && file !== 'README.md')
      .sort() // Sort alphabetically to maintain order
    
    console.log(`📁 Found ${sqlFiles.length} migration files:`, sqlFiles)
    
    const migrations: MigrationFile[] = []
    
    // Read each migration file
    for (const filename of sqlFiles) {
      const filePath = join(migrationsDir, filename)
      const content = await fs.readFile(filePath, 'utf-8')
      
      // Extract order number from filename (e.g., "001_create_client_table.sql" -> 1)
      const orderMatch = filename.match(/^(\d+)_/)
      const order = orderMatch ? parseInt(orderMatch[1], 10) : 999
      
      migrations.push({
        filename,
        content: content.trim(),
        order
      })
    }
    
    // Sort by order number
    migrations.sort((a, b) => a.order - b.order)
    
    // Generate the complete SQL script
    const header = `-- Bills App Database Schema
-- Generated on: ${new Date().toISOString()}
-- This script contains all database migrations combined into a single file
-- Compatible with PostgreSQL and Supabase

-- ==============================================
-- MIGRATION FILES INCLUDED:
${migrations.map(m => `-- ${m.filename}`).join('\n')}
-- ==============================================

`
    
    const footer = `
-- ==============================================
-- END OF MIGRATIONS
-- ==============================================

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoice_client_id ON invoice(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoice(status);
CREATE INDEX IF NOT EXISTS idx_invoice_issue_date ON invoice(issue_date);
CREATE INDEX IF NOT EXISTS idx_expense_invoice_id ON expense(invoice_id);
CREATE INDEX IF NOT EXISTS idx_expense_date ON expense(date);
CREATE INDEX IF NOT EXISTS idx_automation_rule_client_id ON automation_rule(client_id);
CREATE INDEX IF NOT EXISTS idx_automation_rule_is_active ON automation_rule(is_active);

-- Enable Row Level Security (RLS) for Supabase
-- Note: These policies should be configured in Supabase dashboard
-- ALTER TABLE client ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE expense ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE setting ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE automation_rule ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
`
    
    // Combine all migrations
    const migrationSQL = migrations
      .map(migration => {
        return `-- ==============================================
-- ${migration.filename}
-- ==============================================

${migration.content}

`
      })
      .join('\n')
    
    const completeSQL = header + migrationSQL + footer
    
    console.log('✅ Complete SQL script generated successfully')
    return completeSQL
  } catch (error) {
    console.error('❌ Failed to generate SQL script:', error)
    throw error
  }
}

/**
 * Save the generated SQL script to a file
 */
export async function saveSQLScript(outputPath: string): Promise<void> {
  try {
    const sqlContent = await generateCompleteSQLScript()
    
    // Ensure the output directory exists
    const outputDir = dirname(outputPath)
    await fs.mkdir(outputDir, { recursive: true })
    
    // Write the SQL script
    await fs.writeFile(outputPath, sqlContent, 'utf-8')
    
    console.log(`✅ SQL script saved to: ${outputPath}`)
  } catch (error) {
    console.error('❌ Failed to save SQL script:', error)
    throw error
  }
}

/**
 * Get the SQL script content as a string (for download)
 */
export async function getSQLScriptContent(): Promise<string> {
  return await generateCompleteSQLScript()
}

/**
 * Get migration file information
 */
export async function getMigrationInfo(): Promise<Array<{ filename: string; order: number; size: number }>> {
  try {
    const migrationsDir = join(__dirname, '..', 'migrations')
    const files = await fs.readdir(migrationsDir)
    const sqlFiles = files
      .filter(file => file.endsWith('.sql') && file !== 'README.md')
      .sort()
    
    const migrations = []
    
    for (const filename of sqlFiles) {
      const filePath = join(migrationsDir, filename)
      const stats = await fs.stat(filePath)
      const orderMatch = filename.match(/^(\d+)_/)
      const order = orderMatch ? parseInt(orderMatch[1], 10) : 999
      
      migrations.push({
        filename,
        order,
        size: stats.size
      })
    }
    
    return migrations.sort((a, b) => a.order - b.order)
  } catch (error) {
    console.error('❌ Failed to get migration info:', error)
    return []
  }
}
