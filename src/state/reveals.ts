import type { SeasonReview } from '../engine/seasonReview';
import type { Level } from './schemas';

export type RevealData =
  | { kind: 'draft'; player: string; college: string; pick: number | null; teamName: string; mascot: string; abbrev: string; colors: [string, string]; salary: number; years: number; ovr: number }
  | { kind: 'commit'; player: string; college: string; mascot: string; abbrev: string; colors: [string, string]; stars: number }
  | { kind: 'champion'; teamName: string; mascot: string; abbrev: string; colors: [string, string]; record: string; level: Level; season: number }
  | { kind: 'award'; name: string; level: Level; season: number; colors: [string, string]; player: string }
  | { kind: 'season'; review: SeasonReview; summary: string }
  | { kind: 'contract'; player: string; teamName: string; mascot: string; abbrev: string; colors: [string, string]; salary: number; years: number };

export type Reveal = RevealData & { id: number };
