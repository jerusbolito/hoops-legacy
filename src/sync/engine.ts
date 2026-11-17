import { GameStateSchema, LegendSchema, SAVE_VERSION, type Legend } from '../state/schemas';
import { syncStore, type SyncMeta } from '../state/persistence';

/**
 * Cloud sync for saves and the Hall of Fame.
 *
 * This device's IndexedDB stays the source of truth; the cloud is a copy. Every cloud row carries a revision that
 * the server bumps on each change. A device remembers the revision it last saw (`SyncMeta.rev`) and whether it has
 * changed the row since (`dirty`). Uploads are guarded by that revision, so a device can never silently overwrite
 * work it has not seen: if the cloud moved on while this device also edited, that is a conflict the player decides.
 */

type Kind = SyncMeta['kind'];

export interface CloudRowInfo {
  id: string;
  rev: number;
  deleted: boolean;
  name: string;
  subtitle: string;
  clientUpdated: number;
}

export interface CloudRowFull extends CloudRowInfo {
  data: unknown;
  schemaVersion: number;
}

export interface CloudPush {
  id: string;
  /** Absent when only a delete is being recorded. */
  data?: unknown;
  name?: string;
  subtitle?: string;
  schemaVersion?: number;
  clientUpdated?: number;
  deleted: boolean;
}

/** The only thing the engine needs from a server. Implemented for Supabase in `cloud.ts`, faked in tests. */
export interface CloudApi {
  list(kind: Kind): Promise<CloudRowInfo[]>;
  fetch(kind: Kind, id: string): Promise<CloudRowFull | null>;
  /** `baseRev` 0 inserts a new row. Otherwise updates only if the cloud is still at `baseRev`. */
  push(kind: Kind, row: CloudPush, baseRev: number): Promise<{ rev: number } | 'conflict'>;
}

export interface Conflict {
  id: string;
  name: string;
  localSubtitle: string;
  localUpdated: number;
  remote: CloudRowInfo;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  removed: number;
  conflicts: Conflict[];
  /** Cloud rows saved by a newer version of the app than this one; left alone until the app is updated. */
  needsAppUpdate: number;
  /** Cloud rows that could not be read; left alone. */
  unreadable: number;
}

const empty = (): SyncResult => ({ uploaded: 0, downloaded: 0, removed: 0, conflicts: [], needsAppUpdate: 0, unreadable: 0 });

async function payloadFor(kind: Kind, id: string): Promise<CloudPush | null> {
  if (kind === 'save') {
    const row = await syncStore.getSave(id);
    if (!row) return null;
    return { id, data: row.state, name: row.name, subtitle: row.subtitle, schemaVersion: row.state.version, clientUpdated: row.updatedAt, deleted: false };
  }
  const legend = await syncStore.getLegend(id);
  if (!legend) return null;
  return { id, data: legend, deleted: false };
}

/** Pulls one row down and files it locally. Returns false if the row could not be used. */
async function download(kind: Kind, api: CloudApi, id: string, res: SyncResult): Promise<void> {
  const row = await api.fetch(kind, id);
  if (!row || row.deleted) return;
  if (row.schemaVersion > SAVE_VERSION && kind === 'save') {
    res.needsAppUpdate++;
    return;
  }
  if (kind === 'save') {
    const parsed = GameStateSchema.safeParse(row.data);
    if (!parsed.success) {
      res.unreadable++;
      return;
    }
    await syncStore.putSaveFromCloud({ id, name: row.name, subtitle: row.subtitle, updatedAt: row.clientUpdated || Date.now(), state: parsed.data }, row.rev);
  } else {
    const parsed = LegendSchema.safeParse(row.data);
    if (!parsed.success) {
      res.unreadable++;
      return;
    }
    await syncStore.putLegendFromCloud(parsed.data as Legend, row.rev);
  }
  res.downloaded++;
}

async function upload(kind: Kind, api: CloudApi, id: string, baseRev: number, res: SyncResult, remote?: CloudRowInfo): Promise<void> {
  const body = await payloadFor(kind, id);
  if (!body) return;
  const out = await api.push(kind, body, baseRev);
  if (out === 'conflict') {
    await recordConflict(kind, id, res, remote);
    return;
  }
  await syncStore.markSynced(kind, id, out.rev);
  res.uploaded++;
}

async function recordConflict(kind: Kind, id: string, res: SyncResult, remote?: CloudRowInfo): Promise<void> {
  if (kind !== 'save') return;
  const row = await syncStore.getSave(id);
  if (!row) return;
  res.conflicts.push({
    id,
    name: row.name,
    localSubtitle: row.subtitle,
    localUpdated: row.updatedAt,
    remote: remote ?? { id, rev: 0, deleted: false, name: row.name, subtitle: '', clientUpdated: 0 },
  });
}

async function syncKind(kind: Kind, api: CloudApi, res: SyncResult): Promise<void> {
  const remote = new Map((await api.list(kind)).map((r) => [r.id, r]));
  const metas = new Map((await syncStore.allMeta()).filter((m) => m.kind === kind).map((m) => [m.id, m]));
  const localIds = new Set(kind === 'save' ? await syncStore.allSaveIds() : await syncStore.allLegendIds());
  const ids = new Set<string>([...localIds, ...remote.keys(), ...[...metas.values()].filter((m) => m.deleted).map((m) => m.id)]);

  for (const id of ids) {
    const r = remote.get(id);
    const m = metas.get(id);
    const hasLocal = localIds.has(id);

    // deleted here: tell the cloud, unless it changed there since (then the cloud copy is kept)
    if (m?.deleted) {
      if (!r || r.deleted) {
        await syncStore.forget(kind, id);
      } else if (r.rev === m.rev) {
        const out = await api.push(kind, { id, deleted: true }, m.rev);
        if (out === 'conflict') await download(kind, api, id, res);
        else {
          await syncStore.forget(kind, id);
          res.removed++;
        }
      } else {
        await download(kind, api, id, res); // edited elsewhere after the delete: the delete loses (this also clears the tombstone)
      }
      continue;
    }

    if (hasLocal) {
      const rev0 = m?.rev ?? 0;
      const dirty = m ? m.dirty === 1 : true;

      if (!r) {
        await upload(kind, api, id, 0, res);
      } else if (r.deleted) {
        // deleted elsewhere: an unsent edit here wins and brings it back, otherwise the delete is followed
        if (dirty) await upload(kind, api, id, r.rev, res, r);
        else {
          await syncStore.removeFromCloud(kind, id);
          res.removed++;
        }
      } else if (rev0 > 0 && r.rev === rev0) {
        if (dirty) await upload(kind, api, id, rev0, res, r);
      } else if (rev0 > 0 && !dirty) {
        await download(kind, api, id, res); // the cloud is ahead and nothing here is unsent: fast-forward
      } else if (kind === 'legend') {
        await upload(kind, api, id, r.rev, res, r); // a legend has one right answer: the latest filing
      } else {
        await recordConflict(kind, id, res, r);
      }
    } else if (r && !r.deleted) {
      await download(kind, api, id, res);
    } else if (m) {
      await syncStore.forget(kind, id);
    }
  }
}

let running: Promise<SyncResult> | null = null;

/** One full pass: saves, then the Hall of Fame. Overlapping calls share one pass. */
export function syncAll(api: CloudApi, userId: string): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    try {
      await syncStore.bindAccount(userId);
      const res = empty();
      await syncKind('save', api, res);
      await syncKind('legend', api, res);
      return res;
    } finally {
      running = null;
    }
  })();
  return running;
}

export type ConflictChoice = 'device' | 'cloud' | 'both';

/**
 * Settles one conflict. `device` overwrites the cloud copy with this device's save, `cloud` replaces this device's
 * save with the cloud copy, and `both` keeps this device's version as a separate save and takes the cloud copy
 * under the original id, so nothing is lost either way.
 */
export async function resolveConflict(api: CloudApi, id: string, choice: ConflictChoice): Promise<'ok' | 'conflict' | 'missing'> {
  const remote = (await api.list('save')).find((r) => r.id === id);
  if (!remote) return 'missing';
  const res = empty();
  if (choice === 'device') {
    const body = await payloadFor('save', id);
    if (!body) return 'missing';
    const out = await api.push('save', body, remote.rev);
    if (out === 'conflict') return 'conflict';
    await syncStore.markSynced('save', id, out.rev);
    return 'ok';
  }
  if (choice === 'both') {
    const copyId = `${id}-copy-${Math.random().toString(36).slice(2, 8)}`;
    await syncStore.renameSave(id, copyId);
  }
  await download('save', api, id, res);
  return res.downloaded ? 'ok' : 'missing';
}
