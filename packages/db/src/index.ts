import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { bootstrapSQL } from './schema';

/** Resolve DB directory:
 * - DEV: ./pgdata (repo root)
 * - PROD: Electron main will pass absolute path via env DB_DIR
 */
const dbDir = process.env.DB_DIR || './pgdata';
export const client = new PGlite(dbDir);
export const db = drizzle({ client });

/** Initialize schema on first run */
export async function initDb() {
  await client.exec(bootstrapSQL);
}

export async function healthcheck(): Promise<boolean> {
  const r = await client.query("select 1 as ok;");
  return (r.rows?.[0] as any)?.ok === 1;
}
