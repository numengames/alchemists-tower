import { describe, expect, it } from 'vitest';

import {
  buildCreateTableSql,
  buildInsertSql,
  pgTypeToSqliteAffinity,
  quoteIdent,
  serializeForSqlite,
} from './sqlite-mapping';

describe('pgTypeToSqliteAffinity', () => {
  it('maps integer family to INTEGER', () => {
    for (const t of ['integer', 'bigint', 'smallint', 'int4', 'int8', 'serial']) {
      expect(pgTypeToSqliteAffinity(t)).toBe('INTEGER');
    }
  });

  it('maps floating/decimal family to REAL', () => {
    for (const t of ['numeric', 'decimal', 'real', 'double precision', 'float']) {
      expect(pgTypeToSqliteAffinity(t)).toBe('REAL');
    }
  });

  it('maps bytea to BLOB', () => {
    expect(pgTypeToSqliteAffinity('bytea')).toBe('BLOB');
  });

  it('falls back to TEXT for the engine string/timestamp/json columns', () => {
    for (const t of [
      'text',
      'character varying',
      'character varying(255)',
      'timestamp without time zone',
      'timestamp with time zone',
      'date',
      'json',
      'jsonb',
      'uuid',
      'boolean',
    ]) {
      expect(pgTypeToSqliteAffinity(t)).toBe('TEXT');
    }
  });

  it('is case-insensitive', () => {
    expect(pgTypeToSqliteAffinity('INTEGER')).toBe('INTEGER');
    expect(pgTypeToSqliteAffinity('Numeric')).toBe('REAL');
  });
});

describe('serializeForSqlite', () => {
  it('converts Date to ISO string (engine writes ISO timestamps)', () => {
    const d = new Date('2026-06-09T10:20:30.000Z');
    expect(serializeForSqlite(d)).toBe('2026-06-09T10:20:30.000Z');
  });

  it('converts booleans to 1/0', () => {
    expect(serializeForSqlite(true)).toBe(1);
    expect(serializeForSqlite(false)).toBe(0);
  });

  it('passes through numbers and bigints', () => {
    expect(serializeForSqlite(42)).toBe(42);
    expect(serializeForSqlite(0)).toBe(0);
    expect(serializeForSqlite(10n)).toBe(10n);
  });

  it('JSON-stringifies plain objects and arrays (json/jsonb columns)', () => {
    expect(serializeForSqlite({ a: 1, b: [2, 3] })).toBe('{"a":1,"b":[2,3]}');
    expect(serializeForSqlite([1, 2, 3])).toBe('[1,2,3]');
  });

  it('passes Buffers through unchanged (bytea)', () => {
    const buf = Buffer.from([1, 2, 3]);
    expect(serializeForSqlite(buf)).toBe(buf);
  });

  it('maps null and undefined to null', () => {
    expect(serializeForSqlite(null)).toBeNull();
    expect(serializeForSqlite(undefined)).toBeNull();
  });

  it('leaves strings untouched (the common case: id, JSON-in-text data)', () => {
    expect(serializeForSqlite('hello')).toBe('hello');
    expect(serializeForSqlite('{"already":"json"}')).toBe('{"already":"json"}');
  });
});

describe('quoteIdent', () => {
  it('double-quotes plain identifiers', () => {
    expect(quoteIdent('entities')).toBe('"entities"');
  });

  it('escapes embedded double quotes', () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });
});

describe('buildCreateTableSql', () => {
  it('builds a CREATE TABLE with NOT NULL and a primary key', () => {
    const sql = buildCreateTableSql(
      'blueprints',
      [
        { name: 'id', affinity: 'TEXT', notNull: true },
        { name: 'data', affinity: 'TEXT', notNull: true },
        { name: 'createdAt', affinity: 'TEXT', notNull: true },
        { name: 'updatedAt', affinity: 'TEXT' },
      ],
      ['id'],
    );
    expect(sql).toBe(
      'CREATE TABLE "blueprints" (\n' +
        '  "id" TEXT NOT NULL,\n' +
        '  "data" TEXT NOT NULL,\n' +
        '  "createdAt" TEXT NOT NULL,\n' +
        '  "updatedAt" TEXT,\n' +
        '  PRIMARY KEY ("id")\n' +
        ')',
    );
  });

  it('omits the PRIMARY KEY clause when none given', () => {
    const sql = buildCreateTableSql('config', [
      { name: 'key', affinity: 'TEXT' },
      { name: 'value', affinity: 'TEXT' },
    ]);
    expect(sql).not.toContain('PRIMARY KEY');
  });

  it('throws on zero columns', () => {
    expect(() => buildCreateTableSql('empty', [])).toThrow(/zero columns/);
  });
});

describe('buildInsertSql', () => {
  it('builds a parameterised insert', () => {
    expect(buildInsertSql('users', ['id', 'name', 'rank'])).toBe(
      'INSERT INTO "users" ("id", "name", "rank") VALUES (?, ?, ?)',
    );
  });

  it('throws on zero columns', () => {
    expect(() => buildInsertSql('users', [])).toThrow(/zero columns/);
  });
});
