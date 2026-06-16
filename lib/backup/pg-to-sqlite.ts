/**
 * Export a hyperfy2 world's state from its Postgres schema into a standalone
 * `db.sqlite` file that the engine can open offline (DB_URI=local).
 *
 * Strategy: introspect the *live* schema with `information_schema` rather than
 * hardcoding the engine's tables, so a world on any migration version round-
 * trips faithfully. The `config.version` row is copied verbatim, so when the
 * engine boots against the exported file it sees its schema as already-migrated
 * and runs no further migrations.
 *
 * The engine persists exactly four tables; we export them in dependency-free
 * order. Unknown extra tables in the schema are ignored by default.
 */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import type { Client } from 'pg';

import {
  buildCreateTableSql,
  buildInsertSql,
  pgTypeToSqliteAffinity,
  serializeForSqlite,
  type SqliteAffinity,
} from './sqlite-mapping';

/** Tables the hyperfy2 engine persists, in a safe export order. */
export const WORLD_TABLES = ['config', 'users', 'blueprints', 'entities'] as const;

interface IntrospectedColumn {
  name: string;
  affinity: SqliteAffinity;
  notNull: boolean;
}

export interface ConvertResult {
  /** Rows exported per table (only tables that existed in the schema). */
  tables: Record<string, number>;
  /** Tables requested but absent from the source schema. */
  missing: string[];
  /** Absolute path of the written SQLite file. */
  sqlitePath: string;
}

export interface ConvertOptions {
  /** Connected pg client. Its search_path need not be set — we qualify by schema. */
  pg: Client;
  /** The world's Postgres schema, e.g. `pre-numinia-genesis`. */
  schema: string;
  /** Destination path for the generated SQLite file (must not pre-exist). */
  sqlitePath: string;
  /** Override the table list (defaults to WORLD_TABLES). */
  tables?: readonly string[];
}

/**
 * Convert one world schema into a SQLite file. Returns per-table row counts.
 * Throws if the destination already exists, to avoid clobbering a prior export.
 */
export async function convertWorldSchemaToSqlite(opts: ConvertOptions): Promise<ConvertResult> {
  const { pg, schema, sqlitePath } = opts;
  const tables = opts.tables ?? WORLD_TABLES;

  if (existsSync(sqlitePath)) {
    throw new Error(`Refusing to overwrite existing SQLite file: ${sqlitePath}`);
  }

  const sqlite = new Database(sqlitePath, { fileMustExist: false });
  // Bulk-load tuning: the file is single-writer and disposable until we finish.
  sqlite.pragma('journal_mode = MEMORY');
  sqlite.pragma('synchronous = OFF');

  const result: ConvertResult = { tables: {}, missing: [], sqlitePath };

  try {
    for (const table of tables) {
      const columns = await introspectColumns(pg, schema, table);
      if (columns.length === 0) {
        result.missing.push(table);
        continue;
      }
      const primaryKey = await introspectPrimaryKey(pg, schema, table);

      sqlite.exec(buildCreateTableSql(table, columns, primaryKey));

      const count = await copyRows(pg, sqlite, schema, table, columns);
      result.tables[table] = count;
    }
  } finally {
    sqlite.close();
  }

  return result;
}

/** Read a table's columns from information_schema, in declaration order. */
async function introspectColumns(
  pg: Client,
  schema: string,
  table: string,
): Promise<IntrospectedColumn[]> {
  const { rows } = await pg.query<{
    column_name: string;
    data_type: string;
    is_nullable: 'YES' | 'NO';
  }>(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [schema, table],
  );
  return rows.map((r) => ({
    name: r.column_name,
    affinity: pgTypeToSqliteAffinity(r.data_type),
    notNull: r.is_nullable === 'NO',
  }));
}

/** Read a table's primary-key columns (empty if none). */
async function introspectPrimaryKey(pg: Client, schema: string, table: string): Promise<string[]> {
  const { rows } = await pg.query<{ attname: string }>(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = to_regclass($1) AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)`,
    [`${quoteRegclass(schema)}.${quoteRegclass(table)}`],
  );
  return rows.map((r) => r.attname);
}

/** Stream rows from pg and insert them into SQLite inside a single transaction. */
async function copyRows(
  pg: Client,
  sqlite: Database.Database,
  schema: string,
  table: string,
  columns: IntrospectedColumn[],
): Promise<number> {
  const colNames = columns.map((c) => c.name);
  const insert = sqlite.prepare(buildInsertSql(table, colNames));

  const { rows } = await pg.query({
    text: `SELECT ${colNames.map(quotePgIdent).join(', ')} FROM ${quotePgIdent(schema)}.${quotePgIdent(table)}`,
    rowMode: 'array',
  });

  const insertMany = sqlite.transaction((batch: unknown[][]) => {
    for (const row of batch) {
      insert.run(row.map(serializeForSqlite));
    }
  });
  insertMany(rows as unknown[][]);

  return rows.length;
}

/** Double-quote a pg identifier for use in SQL text. */
function quotePgIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

/** Escape an identifier embedded inside a regclass string literal. */
function quoteRegclass(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}
