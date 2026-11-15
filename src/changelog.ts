import raw from '../CHANGELOG.md?raw';

export interface ChangeSection {
  title: string | null;
  items: string[];
}
export interface ChangeEntry {
  version: string;
  sections: ChangeSection[];
}

/** Reads CHANGELOG.md: `## 1.2.0` starts a release, `### Title` a group, `- item` a change. Anything else is ignored. */
export function parseChangelog(md: string): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  let entry: ChangeEntry | null = null;
  let section: ChangeSection | null = null;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const v = /^##\s+(\S.*)$/.exec(line);
    const t = /^###\s+(\S.*)$/.exec(line);
    const i = /^-\s+(\S.*)$/.exec(line);
    if (v) {
      entry = { version: v[1].trim(), sections: [] };
      entries.push(entry);
      section = null;
    } else if (t && entry) {
      section = { title: t[1].trim(), items: [] };
      entry.sections.push(section);
    } else if (i && entry) {
      if (!section) {
        section = { title: null, items: [] };
        entry.sections.push(section);
      }
      section.items.push(i[1].trim());
    }
  }
  return entries;
}

export const CHANGELOG: ChangeEntry[] = parseChangelog(raw);
