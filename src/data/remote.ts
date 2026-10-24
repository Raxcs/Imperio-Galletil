import { supabase, withTimeout } from '../lib/supabase';
import { DELETED_PREFIX, stripDeletedPrefix } from '../lib/sync';
import { LocalRecord, RemoteRecord } from './collection';

/** The cloud side of a collection. Supabase is a backup replica, never the source of truth. */
export interface RemoteTable<T> {
  readonly table: string;
  /** Every row, deleted ones included (they become local tombstones). Null when unreachable. */
  pull(): Promise<RemoteRecord<T>[] | null>;
  /** Upserts the records and resolves with the ids the server confirmed. Never throws. */
  push(records: LocalRecord<T>[]): Promise<string[]>;
}

export interface TableMapping<T> {
  table: string;
  /** Columns written on push. `is_deleted` is added automatically. */
  toRow(item: T): Record<string, unknown>;
  /** Builds the local item from a row. Return null to skip unusable rows. */
  fromRow(row: any): T | null;
  /**
   * Text columns that older app versions used to mark deletes with `__DELETED__`.
   * Rows carrying the prefix are treated as deleted and the prefix is stripped.
   */
  legacyDeletedColumns?: string[];
  /** Extra legacy delete markers (e.g. the 'archived' ingredient category). */
  isLegacyDeleted?(row: any): boolean;
}

const BATCH_SIZE = 100;

export function createSupabaseTable<T extends { id: string }>(mapping: TableMapping<T>): RemoteTable<T> {
  const toPayload = (r: LocalRecord<T>) => {
    const row: Record<string, unknown> = { ...mapping.toRow(r.data), is_deleted: r.deleted };
    for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
    return row;
  };

  /**
   * A bulk upsert sends the union of all columns and writes NULL where a row lacks one
   * (e.g. a migrated record without created_at would wipe that column). Rows are therefore
   * grouped so every request carries exactly the same columns.
   */
  const groupByColumns = (batch: LocalRecord<T>[]) => {
    const groups = new Map<string, { records: LocalRecord<T>[]; rows: Record<string, unknown>[] }>();
    for (const r of batch) {
      const row = toPayload(r);
      const signature = Object.keys(row).sort().join(',');
      const group = groups.get(signature) ?? { records: [], rows: [] };
      group.records.push(r);
      group.rows.push(row);
      groups.set(signature, group);
    }
    return [...groups.values()];
  };

  /**
   * 'rejected' means the server answered with an error (bad row, constraint, RLS).
   * 'unreachable' means there is no usable connection, so retrying now is pointless.
   */
  const upsertRows = async (rows: Record<string, unknown>[]): Promise<'ok' | 'rejected' | 'unreachable'> => {
    try {
      const { error } = await withTimeout(supabase.from(mapping.table).upsert(rows, { onConflict: 'id' }), 10000);
      if (!error) return 'ok';
      console.warn(`Error pushing to ${mapping.table}`, error);
      // supabase-js reports fetch failures as errors without a server code
      return error.code ? 'rejected' : 'unreachable';
    } catch (err) {
      console.warn(`Error pushing to ${mapping.table}`, err);
      return 'unreachable';
    }
  };

  return {
    table: mapping.table,

    async pull() {
      try {
        const { data, error } = await withTimeout(supabase.from(mapping.table).select('*'), 10000);
        if (error || !Array.isArray(data)) {
          if (error) console.warn(`Error pulling ${mapping.table}`, error);
          return null;
        }
        const result: RemoteRecord<T>[] = [];
        for (const row of data) {
          let deleted = !!row.is_deleted;
          const clean = { ...row };
          for (const col of mapping.legacyDeletedColumns ?? []) {
            if (typeof clean[col] === 'string' && clean[col].startsWith(DELETED_PREFIX)) {
              deleted = true;
              clean[col] = stripDeletedPrefix(clean[col]);
            }
          }
          if (mapping.isLegacyDeleted?.(row)) deleted = true;
          const item = mapping.fromRow(clean);
          if (item) result.push({ data: item, deleted });
        }
        return result;
      } catch (err) {
        console.warn(`Error pulling ${mapping.table}`, err);
        return null;
      }
    },

    async push(records) {
      const confirmed: string[] = [];
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        for (const group of groupByColumns(records.slice(i, i + BATCH_SIZE))) {
          const result = await upsertRows(group.rows);
          if (result === 'ok') {
            confirmed.push(...group.records.map((r) => r.data.id));
            continue;
          }
          if (result === 'unreachable') return confirmed;
          // One bad row must not block the rest: retry the rejected group row by row
          if (group.rows.length === 1) continue;
          for (let j = 0; j < group.rows.length; j++) {
            const single = await upsertRows([group.rows[j]]);
            if (single === 'ok') confirmed.push(group.records[j].data.id);
            else if (single === 'unreachable') return confirmed;
          }
        }
      }
      return confirmed;
    },
  };
}
