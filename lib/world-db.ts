/**
 * Postgres helper for world-runtime schemas. Opens an ad-hoc connection to
 * the worlds database (separate from the backoffice's own DB) and issues
 * `CREATE SCHEMA` so the world pod has its schema ready on first boot.
 *
 * Configuration:
 *   - DATABASE_URL  → backoffice DB (Prisma).
 *   - WORLDS_DATABASE_URL (optional) → explicit conn string for the worlds DB.
 *     When unset, derived from DATABASE_URL by swapping the database segment
 *     to `postgres` and dropping the `?schema=` param.
 *
 * The connecting role must have `CREATE` on the worlds database.
 */
import { Client } from 'pg';

const SCHEMA_NAME_RE = /^[a-z][a-z0-9-]{1,62}$/;
const RUNTIME_USER_RE = /^[a-z_][a-z0-9_]{0,62}$/i;

export class WorldDbPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldDbPermissionError';
  }
}

export function deriveWorldsDatabaseUrl(backofficeUrl: string): string {
  const url = new URL(backofficeUrl);
  url.pathname = '/postgres';
  url.search = '';
  return url.toString();
}

/**
 * Idempotently create the schema. Throws `WorldDbPermissionError` on a
 * permission denial so the caller can return a 412 with a generic hint.
 */
export async function createWorldSchema(schemaName: string): Promise<void> {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  const explicit = process.env.WORLDS_DATABASE_URL;
  const backofficeUrl = process.env.DATABASE_URL;
  const connectionString = explicit ?? (backofficeUrl ? deriveWorldsDatabaseUrl(backofficeUrl) : '');
  if (!connectionString) {
    throw new Error('DATABASE_URL (or WORLDS_DATABASE_URL) is not set');
  }

  const runtimeUser = process.env.WORLDS_DB_RUNTIME_USER ?? 'app_user';
  if (!RUNTIME_USER_RE.test(runtimeUser)) {
    throw new Error(`Invalid WORLDS_DB_RUNTIME_USER: ${runtimeUser}`);
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    // Identifiers validated upstream; double-quoting handles hyphens in names.
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await client.query(`GRANT USAGE, CREATE ON SCHEMA "${schemaName}" TO ${runtimeUser}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/permission denied|must be owner|insufficient privilege/i.test(message)) {
      throw new WorldDbPermissionError(
        `Database role lacks CREATE on the worlds database (${message})`,
      );
    }
    throw err;
  } finally {
    await client.end();
  }
}

/**
 * Drop the world's schema and ALL its data (tables, sequences, etc) via
 * CASCADE. The connecting role must be the schema owner (or superuser).
 * Silently no-ops if the schema doesn't exist.
 */
export async function dropWorldSchema(schemaName: string): Promise<void> {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
  const explicit = process.env.WORLDS_DATABASE_URL;
  const backofficeUrl = process.env.DATABASE_URL;
  const connectionString =
    explicit ?? (backofficeUrl ? deriveWorldsDatabaseUrl(backofficeUrl) : '');
  if (!connectionString) {
    throw new Error('DATABASE_URL (or WORLDS_DATABASE_URL) is not set');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    await client.end();
  }
}
