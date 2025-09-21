/** Minimal schema via raw SQL to keep deps small; you can add drizzle table builders later. */
export const bootstrapSQL = `
  create table if not exists client (
    id text primary key,
    name text not null,
    email text,
    address text,
    phone text,
    hidden boolean default false,
    tax_id text,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  create table if not exists invoice (
    id text primary key,
    number text unique not null,
    client_id text not null references client(id),
    issue_date date not null,
    due_date date,
    expected_payment_date date,
    amount numeric(12,2) not null,
    currency text default 'EUR',
    status text default 'DRAFT',
    file_path text,
    folder_path text,
    description text,
    notes text,
    paid_at timestamp,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  create table if not exists expense (
    id text primary key,
    invoice_id text references invoice(id),
    vendor text,
    category text,
    date date not null,
    amount numeric(12,2) not null,
    currency text default 'EUR',
    file_path text,
    notes text,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  create table if not exists setting (
    id integer primary key,
    data_root text, -- Single root folder for all app data
    bills_root text, -- Legacy - kept for migration
    expenses_root text, -- Legacy - kept for migration
    filename_tpl text,
    security text, -- JSON string: { hasPassword: boolean, salt: string, hash: string } or null
    company_profile text, -- JSON string: seller profile (name, address, tax ids, bank)
    smtp_config text, -- JSON string: { host: string, port: number, secure: boolean, user: string, password: string } or null
    openai_key text, -- JSON string: { algo: string, iv: string, cipherText: string } or null
    ai_backend text default 'local', -- AI backend: 'local' | 'openai' | 'ollama'
    supabase_url text, -- Cloud sync: Supabase project URL
    supabase_key text, -- Cloud sync: encrypted anon/service key payload JSON
    supabase_sync_enabled boolean default false, -- Whether cloud sync is enabled
    last_sync_at timestamp, -- Last successful sync timestamp (UTC)
    supabase_conflict_policy text default 'cloud_wins', -- 'cloud_wins' | 'local_wins'
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  create table if not exists automation_rule (
    id text primary key,
    client_id text not null references client(id),
    name text not null,
    day_of_month integer not null check (day_of_month >= 1 and day_of_month <= 31),
    amount numeric(12,2) not null,
    currency text default 'EUR',
    description text not null,
    subject_template text not null,
    body_template text not null,
    cc_emails text, -- JSON array of CC email addresses
    is_active boolean default true,
    last_sent_date date,
    next_due_date date,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

`;
