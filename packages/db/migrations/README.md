# Database Migrations

This directory contains SQL migration files for the Bills App database schema. These migrations are designed to work with both local PGlite databases and Supabase cloud databases.

## Migration Files

- `001_create_client_table.sql` - Creates the client table for storing customer information
- `002_create_invoice_table.sql` - Creates the invoice table for storing invoice data
- `003_create_expense_table.sql` - Creates the expense table for storing expense records
- `004_create_setting_table.sql` - Creates the setting table for application configuration
- `005_create_automation_rule_table.sql` - Creates the automation_rule table for automated invoice generation

## Usage

### Local Development (PGlite)

The migrations are automatically applied when the database is initialized via the `initDb()` function in the main db package.

### Supabase Cloud Database

To apply migrations to a Supabase database, you have several options:

#### Option 1: Using Supabase CLI (Recommended)

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Initialize Supabase in your project (if not already done):
   ```bash
   supabase init
   ```

3. Copy the migration files to your Supabase migrations directory:
   ```bash
   cp packages/db/migrations/*.sql supabase/migrations/
   ```

4. Apply migrations to your Supabase project:
   ```bash
   supabase db push
   ```

#### Option 2: Using the Migration Utilities

The db package includes utilities to apply migrations programmatically:

```typescript
import { applySupabaseMigrations } from '@bills/db'

const result = await applySupabaseMigrations(
  'https://your-project.supabase.co',
  'your-anon-key'
)

if (result.success) {
  console.log('Migrations applied successfully:', result.appliedMigrations)
} else {
  console.error('Migration errors:', result.errors)
}
```

#### Option 3: Manual Application

You can also manually copy and paste the SQL from the migration files into the Supabase SQL editor.

## Migration Scripts

The package.json includes several helpful scripts:

- `npm run migrate:list` - List all available migrations
- `npm run migrate:validate` - Validate migration files
- `npm run migrate:sql` - Get combined SQL for all migrations
- `npm run supabase:push` - Push migrations to Supabase
- `npm run supabase:reset` - Reset Supabase database
- `npm run supabase:diff` - Generate diff for schema changes

## Migration Features

Each migration file includes:

- **Table Creation**: Creates tables with proper data types and constraints
- **Indexes**: Adds performance indexes for common queries
- **Constraints**: Includes data validation constraints
- **Triggers**: Automatic timestamp updates for `updated_at` columns
- **Comments**: Detailed documentation for each table and column

## Schema Compatibility

The migrations are designed to be compatible with:

- PostgreSQL (Supabase)
- PGlite (local development)
- Standard SQL features

## Adding New Migrations

When adding new migrations:

1. Create a new file with the next sequential number: `006_description.sql`
2. Include proper comments and documentation
3. Test the migration on both local and Supabase environments
4. Update this README if needed

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure your Supabase key has the necessary permissions
2. **Syntax Errors**: Check that your SQL is compatible with PostgreSQL
3. **Constraint Violations**: Ensure data types and constraints are properly defined

### Validation

Use the validation script to check for common issues:

```bash
npm run migrate:validate
```

This will check for:
- Duplicate migration versions
- Proper SQL syntax
- Required CREATE TABLE statements
