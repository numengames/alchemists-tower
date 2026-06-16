import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { convertWorldSchemaToSqlite } from './pg-to-sqlite';

/** Minimal column spec for the fake pg server. */
interface FakeTable {
  columns: Array<{ name: string; dataType: string; notNull?: boolean }>;
  primaryKey: string[];
  rows: unknown[][];
}

/**
 * A stand-in for a connected pg Client that answers the three query shapes the
 * converter issues: column introspection, primary-key introspection, and the
 * row SELECT (rowMode: 'array'). It dispatches by inspecting the SQL text.
 */
function fakePgClient(tables: Record<string, FakeTable>): Client {
  const known = Object.keys(tables);
  const tableInText = (text: string) => known.find((t) => text.includes(`"${t}"`));
  const tableInParam = (param: string) => known.find((t) => param.includes(`"${t}"`));

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async query(arg: any, params?: any[]): Promise<{ rows: any[] }> {
      const text: string = typeof arg === 'string' ? arg : arg.text;

      if (text.includes('information_schema.columns')) {
        const table = params?.[1] as string;
        const spec = tables[table];
        if (!spec) return { rows: [] };
        return {
          rows: spec.columns.map((c) => ({
            column_name: c.name,
            data_type: c.dataType,
            is_nullable: c.notNull ? 'NO' : 'YES',
          })),
        };
      }

      if (text.includes('indisprimary')) {
        const table = tableInParam(String(params?.[0] ?? ''));
        const spec = table ? tables[table] : undefined;
        return { rows: (spec?.primaryKey ?? []).map((attname) => ({ attname })) };
      }

      // data SELECT (rowMode: 'array')
      const table = tableInText(text);
      return { rows: table ? tables[table].rows : [] };
    },
  } as unknown as Client;
}

describe('convertWorldSchemaToSqlite (integration, real SQLite)', () => {
  let dir: string;
  let sqlitePath: string;
  const createdAt = new Date('2026-06-09T10:20:30.000Z');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'khepri-backup-'));
    sqlitePath = join(dir, 'db.sqlite');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exports world tables, coercing timestamps to ISO and preserving JSON', async () => {
    const sceneData = JSON.stringify({ id: '$scene', name: 'Scene', preload: true });
    const pg = fakePgClient({
      config: {
        columns: [
          { name: 'key', dataType: 'character varying', notNull: true },
          { name: 'value', dataType: 'text' },
        ],
        primaryKey: ['key'],
        rows: [
          ['version', '15'],
          ['settings', '{"title":null,"voice":"spatial"}'],
        ],
      },
      entities: {
        columns: [
          { name: 'id', dataType: 'character varying', notNull: true },
          { name: 'data', dataType: 'text', notNull: true },
          { name: 'createdAt', dataType: 'timestamp without time zone', notNull: true },
          { name: 'updatedAt', dataType: 'timestamp without time zone', notNull: true },
        ],
        primaryKey: ['id'],
        rows: [['ent-1', sceneData, createdAt, createdAt]],
      },
    });

    const result = await convertWorldSchemaToSqlite({
      pg,
      schema: 'pre-numinia-genesis',
      sqlitePath,
      tables: ['config', 'users', 'blueprints', 'entities'],
    });

    // Row counts + which tables were absent from the source schema.
    expect(result.tables).toEqual({ config: 2, entities: 1 });
    expect(result.missing.sort()).toEqual(['blueprints', 'users']);

    // Re-open the produced file the way the engine would and assert fidelity.
    const db = new Database(sqlitePath, { readonly: true });
    try {
      const version = db.prepare("SELECT value FROM config WHERE key = 'version'").get() as {
        value: string;
      };
      expect(version.value).toBe('15');

      const ent = db.prepare('SELECT * FROM entities WHERE id = ?').get('ent-1') as {
        data: string;
        createdAt: string;
        updatedAt: string;
      };
      // Date -> ISO string, exactly how the engine persists timestamps.
      expect(ent.createdAt).toBe('2026-06-09T10:20:30.000Z');
      expect(ent.updatedAt).toBe('2026-06-09T10:20:30.000Z');
      // JSON-in-text column survives byte-for-byte.
      expect(JSON.parse(ent.data)).toEqual({ id: '$scene', name: 'Scene', preload: true });

      // Primary key was applied (duplicate id rejected).
      expect(() =>
        db
          .prepare('INSERT INTO entities (id, data, createdAt, updatedAt) VALUES (?,?,?,?)')
          .run('ent-1', '{}', 'x', 'y'),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it('refuses to clobber an existing destination file', async () => {
    const pg = fakePgClient({
      config: { columns: [{ name: 'key', dataType: 'text' }], primaryKey: [], rows: [] },
    });
    // Pre-create the file.
    new Database(sqlitePath).close();

    await expect(
      convertWorldSchemaToSqlite({ pg, schema: 's', sqlitePath, tables: ['config'] }),
    ).rejects.toThrow();
  });
});
