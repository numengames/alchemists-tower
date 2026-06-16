/**
 * Pure value/type mapping helpers for the Postgres -> SQLite world export.
 *
 * The hyperfy2 engine reads/writes its world state through Knex with identical
 * migrations on both backends, but the *wire types* differ: `pg` hands back
 * `Date` objects and native booleans, whereas the engine (running on
 * better-sqlite3) stores timestamps as ISO strings and booleans inside JSON.
 * These helpers normalise a row read from Postgres into values that better-
 * sqlite3 can bind AND that the engine will read back unchanged.
 *
 * Kept import-free (no native deps) so they unit-test without a database.
 */

/** SQLite column affinity used when recreating a table from a pg column type. */
export type SqliteAffinity = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';

/** A value better-sqlite3 can bind to a prepared statement. */
export type SqliteBindable = string | number | bigint | Buffer | null;

/**
 * Map a Postgres `information_schema.columns.data_type` to a SQLite column
 * affinity. The engine's tables are all text/timestamp/integer, so the mapping
 * is deliberately conservative: anything it doesn't recognise falls back to
 * TEXT, which round-trips the engine's JSON/string columns safely.
 */
export function pgTypeToSqliteAffinity(pgDataType: string): SqliteAffinity {
  const t = pgDataType.toLowerCase();
  if (/bytea/.test(t)) return 'BLOB';
  if (/\b(numeric|decimal|real|double precision|double|float)\b/.test(t)) return 'REAL';
  if (/\b(smallint|integer|bigint|int2|int4|int8|serial)\b/.test(t)) return 'INTEGER';
  // text, varchar, char, timestamp(tz), date, json, jsonb, uuid, boolean, ...
  // are all read by the engine as strings (or JSON), so TEXT is the safe home.
  return 'TEXT';
}

/**
 * Coerce a value read from `pg` into something better-sqlite3 can bind, matching
 * how the engine would have serialised it on SQLite:
 *   - Date            -> ISO 8601 string (engine writes `moment().toISOString()`)
 *   - boolean         -> 1 / 0
 *   - object/array    -> JSON string (json/jsonb columns)
 *   - number/bigint   -> passthrough
 *   - Buffer          -> passthrough (bytea)
 *   - null/undefined  -> null
 */
export function serializeForSqlite(value: unknown): SqliteBindable {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'bigint') return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Build a `CREATE TABLE` statement for SQLite from an introspected column list.
 * `primaryKey` columns (if any) get a table-level PRIMARY KEY clause. Column and
 * table identifiers are double-quoted so hyphenated/reserved names are safe.
 */
export function buildCreateTableSql(
  table: string,
  columns: ReadonlyArray<{ name: string; affinity: SqliteAffinity; notNull?: boolean }>,
  primaryKey: readonly string[] = [],
): string {
  if (columns.length === 0) {
    throw new Error(`Cannot create table "${table}" with zero columns`);
  }
  const cols = columns.map((c) => {
    const notNull = c.notNull ? ' NOT NULL' : '';
    return `  ${quoteIdent(c.name)} ${c.affinity}${notNull}`;
  });
  if (primaryKey.length > 0) {
    cols.push(`  PRIMARY KEY (${primaryKey.map(quoteIdent).join(', ')})`);
  }
  return `CREATE TABLE ${quoteIdent(table)} (\n${cols.join(',\n')}\n)`;
}

/** Build a parameterised `INSERT` statement for the given table/columns. */
export function buildInsertSql(table: string, columns: readonly string[]): string {
  if (columns.length === 0) {
    throw new Error(`Cannot insert into "${table}" with zero columns`);
  }
  const placeholders = columns.map(() => '?').join(', ');
  return `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders})`;
}

/** Double-quote a SQL identifier, escaping embedded quotes. */
export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}
