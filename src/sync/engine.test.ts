import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCareer } from '../engine/career';
import { deleteSave, listSaves, loadGame, resetLocalDbForTests, saveGame, saveLegend, listLegends, syncStore } from '../state/persistence';
import { LegendSchema, SAVE_VERSION, type GameState } from '../state/schemas';
import { resolveConflict, syncAll, type CloudApi, type CloudPush, type CloudRowFull, type CloudRowInfo } from './engine';

type Kind = 'save' | 'legend';

/** An in-memory stand-in for the server: same revision rules as supabase/schema.sql. */
class FakeCloud implements CloudApi {
  rows = new Map<string, CloudRowFull>();
  pushes = 0;
  private k = (kind: Kind, id: string) => `${kind}:${id}`;
  async list(kind: Kind): Promise<CloudRowInfo[]> {
    return [...this.rows.entries()].filter(([k]) => k.startsWith(`${kind}:`)).map(([, r]) => ({ id: r.id, rev: r.rev, deleted: r.deleted, name: r.name, subtitle: r.subtitle, clientUpdated: r.clientUpdated }));
  }
  async fetch(kind: Kind, id: string) {
    return this.rows.get(this.k(kind, id)) ?? null;
  }
  async push(kind: Kind, row: CloudPush, baseRev: number) {
    this.pushes++;
    const cur = this.rows.get(this.k(kind, row.id));
    if (baseRev === 0) {
      if (cur) return 'conflict' as const;
      this.rows.set(this.k(kind, row.id), { id: row.id, rev: 1, deleted: row.deleted, name: row.name ?? '', subtitle: row.subtitle ?? '', clientUpdated: row.clientUpdated ?? 0, data: row.data, schemaVersion: row.schemaVersion ?? 1 });
      return { rev: 1 };
    }
    if (!cur || cur.rev !== baseRev) return 'conflict' as const;
    const next = { ...cur, rev: cur.rev + 1, deleted: row.deleted };
    if (row.data !== undefined) Object.assign(next, { data: row.data, name: row.name ?? cur.name, subtitle: row.subtitle ?? cur.subtitle, clientUpdated: row.clientUpdated ?? cur.clientUpdated, schemaVersion: row.schemaVersion ?? cur.schemaVersion });
    this.rows.set(this.k(kind, row.id), next);
    return { rev: next.rev };
  }
  /** Another device changed the row. */
  editElsewhere(kind: Kind, id: string, change: (data: any) => void, extra: Partial<CloudRowFull> = {}) {
    const cur = this.rows.get(this.k(kind, id))!;
    const data = structuredClone(cur.data);
    change(data);
    this.rows.set(this.k(kind, id), { ...cur, data, rev: cur.rev + 1, ...extra });
  }
}

const fresh = (seed: number): GameState => createCareer({ firstName: 'Test', lastName: `P${seed}`, hometown: 'Akron, OH', archetype: 'slasher', position: 'SG', heightIn: 76, schoolIndex: 0, traits: [], seed });
const legend = (id: string) => LegendSchema.parse({ id, saveId: id.split(':')[0], name: 'A B', firstName: 'A', lastName: 'B', score: 50, retiredAt: 1000 });
const USER = 'user-1';

let cloud: FakeCloud;
beforeEach(async () => {
  await resetLocalDbForTests();
  cloud = new FakeCloud();
});

describe('cloud sync', () => {
  it('uploads saves and legends on the first sync, then does nothing when nothing changed', async () => {
    const s = fresh(1);
    await saveGame(s);
    await saveLegend(legend('x:1'));
    const r = await syncAll(cloud, USER);
    expect(r.uploaded).toBe(2);
    expect(cloud.rows.get(`save:${s.id}`)?.rev).toBe(1);
    expect(cloud.rows.get('legend:x:1')?.rev).toBe(1);
    const pushes = cloud.pushes;
    const again = await syncAll(cloud, USER);
    expect(again).toMatchObject({ uploaded: 0, downloaded: 0, removed: 0, conflicts: [] });
    expect(cloud.pushes).toBe(pushes);
  });

  it('brings everything down on a brand-new device', async () => {
    const s = fresh(2);
    await saveGame(s);
    await saveLegend(legend('y:1'));
    await syncAll(cloud, USER);

    await resetLocalDbForTests(); // new device
    const r = await syncAll(cloud, USER);
    expect(r.downloaded).toBe(2);
    expect((await listSaves()).map((x) => x.id)).toEqual([s.id]);
    expect((await loadGame(s.id))?.id).toBe(s.id);
    expect((await listLegends()).map((l) => l.id)).toEqual(['y:1']);
    expect((await syncAll(cloud, USER)).uploaded).toBe(0); // downloaded rows are not "changed here"
  });

  it('uploads a local edit and bumps the revision', async () => {
    const s = fresh(3);
    await saveGame(s);
    await syncAll(cloud, USER);
    await saveGame({ ...s, updatedAt: Date.now() });
    const r = await syncAll(cloud, USER);
    expect(r.uploaded).toBe(1);
    expect(cloud.rows.get(`save:${s.id}`)?.rev).toBe(2);
  });

  it('fast-forwards when the cloud moved on and this device has no unsent changes', async () => {
    const s = fresh(4);
    await saveGame(s);
    await syncAll(cloud, USER);
    cloud.editElsewhere('save', s.id, (d) => (d.career.season = 99), { subtitle: 'edited elsewhere' });
    const r = await syncAll(cloud, USER);
    expect(r.downloaded).toBe(1);
    expect((await loadGame(s.id))?.career.season).toBe(99);
    expect((await syncStore.meta('save', s.id))?.rev).toBe(2);
  });

  it('reports a conflict when both sides changed, and changes nothing until the player decides', async () => {
    const s = fresh(5);
    await saveGame(s);
    await syncAll(cloud, USER);
    cloud.editElsewhere('save', s.id, (d) => (d.career.season = 50));
    const local = structuredClone(s);
    local.career.season = 7;
    await saveGame(local);

    const r = await syncAll(cloud, USER);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].id).toBe(s.id);
    expect((await loadGame(s.id))?.career.season).toBe(7);
    expect((cloud.rows.get(`save:${s.id}`)!.data as GameState).career.season).toBe(50);
  });

  describe('resolving a conflict', () => {
    async function conflicted() {
      const s = fresh(6);
      await saveGame(s);
      await syncAll(cloud, USER);
      cloud.editElsewhere('save', s.id, (d) => (d.career.season = 50));
      const local = structuredClone(s);
      local.career.season = 7;
      await saveGame(local);
      await syncAll(cloud, USER);
      return s;
    }

    it("keep this device's save overwrites the cloud", async () => {
      const s = await conflicted();
      expect(await resolveConflict(cloud, s.id, 'device')).toBe('ok');
      expect((cloud.rows.get(`save:${s.id}`)!.data as GameState).career.season).toBe(7);
      expect((await syncAll(cloud, USER)).conflicts).toHaveLength(0);
    });

    it("keep the cloud's save replaces this device's", async () => {
      const s = await conflicted();
      expect(await resolveConflict(cloud, s.id, 'cloud')).toBe('ok');
      expect((await loadGame(s.id))?.career.season).toBe(50);
      expect((await syncAll(cloud, USER)).conflicts).toHaveLength(0);
    });

    it('keep both leaves two saves and loses nothing', async () => {
      const s = await conflicted();
      expect(await resolveConflict(cloud, s.id, 'both')).toBe('ok');
      const ids = (await listSaves()).map((x) => x.id);
      expect(ids).toHaveLength(2);
      expect((await loadGame(s.id))?.career.season).toBe(50);
      const copy = ids.find((i) => i !== s.id)!;
      expect((await loadGame(copy))?.career.season).toBe(7);
      const r = await syncAll(cloud, USER);
      expect(r.conflicts).toHaveLength(0);
      expect(cloud.rows.get(`save:${copy}`)?.rev).toBe(1);
    });

    it('reports a second conflict if the cloud moved again meanwhile', async () => {
      const s = await conflicted();
      const orig = cloud.list.bind(cloud);
      cloud.list = async (k) => {
        const rows = await orig(k);
        cloud.editElsewhere('save', s.id, (d) => (d.career.season = 51)); // changes after the list is read
        return rows;
      };
      expect(await resolveConflict(cloud, s.id, 'device')).toBe('conflict');
    });
  });

  it('a delete on this device reaches the cloud, and the save does not come back', async () => {
    const s = fresh(7);
    await saveGame(s);
    await syncAll(cloud, USER);
    await deleteSave(s.id);
    const r = await syncAll(cloud, USER);
    expect(r.removed).toBe(1);
    expect(cloud.rows.get(`save:${s.id}`)?.deleted).toBe(true);
    expect(await listSaves()).toHaveLength(0);
    await syncAll(cloud, USER);
    expect(await listSaves()).toHaveLength(0);
    await resetLocalDbForTests(); // a new device does not get the deleted save either
    expect((await syncAll(cloud, USER)).downloaded).toBe(0);
  });

  it('deleting something that never reached the cloud leaves nothing to sync', async () => {
    const s = fresh(8);
    await saveGame(s);
    await deleteSave(s.id);
    const r = await syncAll(cloud, USER);
    expect(r).toMatchObject({ uploaded: 0, removed: 0 });
    expect(cloud.rows.size).toBe(0);
  });

  it('follows a delete made on another device when nothing here is unsent', async () => {
    const s = fresh(9);
    await saveGame(s);
    await syncAll(cloud, USER);
    cloud.editElsewhere('save', s.id, () => {}, { deleted: true });
    const r = await syncAll(cloud, USER);
    expect(r.removed).toBe(1);
    expect(await listSaves()).toHaveLength(0);
  });

  it('keeps unsent work when another device deleted the save', async () => {
    const s = fresh(10);
    await saveGame(s);
    await syncAll(cloud, USER);
    cloud.editElsewhere('save', s.id, () => {}, { deleted: true });
    await saveGame({ ...s, updatedAt: Date.now() });
    await syncAll(cloud, USER);
    expect(await listSaves()).toHaveLength(1);
    expect(cloud.rows.get(`save:${s.id}`)?.deleted).toBe(false);
  });

  it('restores a save that was edited elsewhere after it was deleted here', async () => {
    const s = fresh(11);
    await saveGame(s);
    await syncAll(cloud, USER);
    await deleteSave(s.id);
    cloud.editElsewhere('save', s.id, (d) => (d.career.season = 12));
    await syncAll(cloud, USER);
    expect((await loadGame(s.id))?.career.season).toBe(12);
  });

  it('leaves a save from a newer app version alone', async () => {
    const s = fresh(12);
    await saveGame(s);
    await syncAll(cloud, USER);
    await resetLocalDbForTests();
    cloud.rows.get(`save:${s.id}`)!.schemaVersion = SAVE_VERSION + 1;
    const r = await syncAll(cloud, USER);
    expect(r.needsAppUpdate).toBe(1);
    expect(await listSaves()).toHaveLength(0);
  });

  it('skips a cloud row it cannot read instead of failing the whole sync', async () => {
    const s = fresh(13);
    const t = fresh(14);
    await saveGame(s);
    await saveGame(t);
    await syncAll(cloud, USER);
    await resetLocalDbForTests();
    cloud.rows.get(`save:${s.id}`)!.data = { nonsense: true };
    const r = await syncAll(cloud, USER);
    expect(r.unreadable).toBe(1);
    expect((await listSaves()).map((x) => x.id)).toEqual([t.id]);
  });

  it("a different account signing in does not inherit the first account's cloud state", async () => {
    const s = fresh(15);
    await saveGame(s);
    await syncAll(cloud, 'user-a');
    const other = new FakeCloud();
    const r = await syncAll(other, 'user-b');
    expect(r.uploaded).toBe(1); // everything on the device is new to the new account
    expect(other.rows.get(`save:${s.id}`)?.rev).toBe(1);
  });
});
