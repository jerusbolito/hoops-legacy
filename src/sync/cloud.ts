import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudApi, CloudPush, CloudRowFull, CloudRowInfo } from './engine';

type Kind = 'save' | 'legend';
const table = (kind: Kind) => (kind === 'save' ? 'saves' : 'legends');

/** The sync engine's view of the server, backed by the two tables in supabase/schema.sql. */
export function supabaseCloud(sb: SupabaseClient): CloudApi {
  return {
    async list(kind): Promise<CloudRowInfo[]> {
      const cols = kind === 'save' ? 'id, rev, deleted, name, subtitle, client_updated' : 'id, rev, deleted';
      const { data, error } = await sb.from(table(kind)).select(cols);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        rev: r.rev as number,
        deleted: r.deleted as boolean,
        name: (r.name as string) ?? '',
        subtitle: (r.subtitle as string) ?? '',
        clientUpdated: Number(r.client_updated ?? 0),
      }));
    },

    async fetch(kind, id): Promise<CloudRowFull | null> {
      const { data, error } = await sb.from(table(kind)).select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        rev: data.rev,
        deleted: data.deleted,
        name: data.name ?? '',
        subtitle: data.subtitle ?? '',
        clientUpdated: Number(data.client_updated ?? 0),
        data: data.data,
        schemaVersion: data.schema_version ?? 1,
      };
    },

    async push(kind, row: CloudPush, baseRev) {
      const fields: Record<string, unknown> = { deleted: row.deleted };
      if (row.data !== undefined) {
        fields.data = row.data;
        if (kind === 'save') {
          fields.name = row.name ?? '';
          fields.subtitle = row.subtitle ?? '';
          fields.schema_version = row.schemaVersion ?? 1;
          fields.client_updated = row.clientUpdated ?? 0;
        }
      }
      if (baseRev === 0) {
        const { data, error } = await sb.from(table(kind)).insert({ id: row.id, ...fields }).select('rev').single();
        if (error) {
          if (error.code === '23505') return 'conflict'; // the row appeared since we looked
          throw new Error(error.message);
        }
        return { rev: data.rev };
      }
      // only changes the row if it is still at the revision this device last saw
      const { data, error } = await sb.from(table(kind)).update(fields).eq('id', row.id).eq('rev', baseRev).select('rev');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return 'conflict';
      return { rev: data[0].rev };
    },
  };
}
