/** Minimal schema via raw SQL to keep deps small; you can add drizzle table builders later. */
export const bootstrapSQL = `
  create table if not exists client (
    id text primary key,
    name text not null,
    email text,
    address text,
    phone text,
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
    amount numeric(12,2) not null,
    currency text default 'EUR',
    status text default 'DRAFT',
    file_path text,
    folder_path text,
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
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
  );

  -- Add missing columns to existing installations
  do $$
  begin
    if not exists (select 1 from information_schema.columns where table_name = 'setting' and column_name = 'expenses_root') then
      alter table setting add column expenses_root text;
    end if;
    
    if not exists (select 1 from information_schema.columns where table_name = 'setting' and column_name = 'security') then
      alter table setting add column security text;
    end if;
    
    if not exists (select 1 from information_schema.columns where table_name = 'setting' and column_name = 'data_root') then
      alter table setting add column data_root text;
    end if;

    if not exists (select 1 from information_schema.columns where table_name = 'setting' and column_name = 'company_profile') then
      alter table setting add column company_profile text;
    end if;

    if not exists (select 1 from information_schema.columns where table_name = 'client' and column_name = 'address') then
      alter table client add column address text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'client' and column_name = 'phone') then
      alter table client add column phone text;
    end if;
  exception when others then
    -- Ignore errors (PGlite might not support all information_schema features)
  end $$;
`;
