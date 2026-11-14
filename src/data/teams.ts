import type { Level } from '../state/schemas';

export interface TeamTemplate {
  name: string;
  mascot: string;
  abbrev: string;
  colors: [string, string];
  prestige: number;
}

export const HS_TEAMS: TeamTemplate[] = [
  { name: 'Westbrook High', mascot: 'Wolves', abbrev: 'WBH', colors: ['#2563eb', '#f8fafc'], prestige: 55 },
  { name: 'St. Augustine Prep', mascot: 'Saints', abbrev: 'STA', colors: ['#7c3aed', '#facc15'], prestige: 78 },
  { name: 'Lincoln Central', mascot: 'Lions', abbrev: 'LIN', colors: ['#dc2626', '#fbbf24'], prestige: 62 },
  { name: 'Riverside Academy', mascot: 'Rapids', abbrev: 'RVA', colors: ['#0891b2', '#e2e8f0'], prestige: 48 },
  { name: 'Eastgate High', mascot: 'Eagles', abbrev: 'EGH', colors: ['#16a34a', '#fef08a'], prestige: 44 },
  { name: 'Northside Tech', mascot: 'Titans', abbrev: 'NST', colors: ['#ea580c', '#1e293b'], prestige: 58 },
  { name: 'Oak Hill Christian', mascot: 'Crusaders', abbrev: 'OHC', colors: ['#991b1b', '#f1f5f9'], prestige: 82 },
  { name: 'Southview High', mascot: 'Panthers', abbrev: 'SVH', colors: ['#111827', '#a3e635'], prestige: 40 },
  { name: 'Marshall Magnet', mascot: 'Mustangs', abbrev: 'MAR', colors: ['#b45309', '#fde68a'], prestige: 50 },
  { name: 'Crestwood High', mascot: 'Cougars', abbrev: 'CRW', colors: ['#be185d', '#fce7f3'], prestige: 46 },
];

export const COLLEGE_TEAMS: TeamTemplate[] = [
  { name: 'Carolina State', mascot: 'Blue Herons', abbrev: 'CST', colors: ['#38bdf8', '#0c4a6e'], prestige: 90 },
  { name: 'Kentucky Valley', mascot: 'Wildcats', abbrev: 'KYV', colors: ['#1d4ed8', '#f8fafc'], prestige: 92 },
  { name: 'Great Lakes U', mascot: 'Spartans', abbrev: 'GLU', colors: ['#15803d', '#f0fdf4'], prestige: 80 },
  { name: 'Pacific Tech', mascot: 'Tritons', abbrev: 'PTU', colors: ['#0e7490', '#fde047'], prestige: 70 },
  { name: 'Lone Star University', mascot: 'Longhorns', abbrev: 'LSU', colors: ['#c2410c', '#fff7ed'], prestige: 76 },
  { name: 'Georgetown Heights', mascot: 'Hoyas', abbrev: 'GTH', colors: ['#1e3a8a', '#94a3b8'], prestige: 72 },
  { name: 'Mountain West College', mascot: 'Rams', abbrev: 'MWC', colors: ['#854d0e', '#fef3c7'], prestige: 55 },
  { name: 'Gulf Coast State', mascot: 'Gators', abbrev: 'GCS', colors: ['#ea580c', '#1d4ed8'], prestige: 66 },
  { name: 'Ivy Ridge', mascot: 'Bulldogs', abbrev: 'IVR', colors: ['#7f1d1d', '#e5e7eb'], prestige: 45 },
  { name: 'Desert Sun U', mascot: 'Scorpions', abbrev: 'DSU', colors: ['#b91c1c', '#fcd34d'], prestige: 58 },
  { name: 'Midwest A&M', mascot: 'Bison', abbrev: 'MAM', colors: ['#4d7c0f', '#ecfccb'], prestige: 50 },
  { name: 'Bay City U', mascot: 'Golden Bears', abbrev: 'BCU', colors: ['#1e40af', '#facc15'], prestige: 84 },
];

export const PRO_TEAMS: TeamTemplate[] = [
  { name: 'New York', mascot: 'Knights', abbrev: 'NYK', colors: ['#1d4ed8', '#f97316'], prestige: 75 },
  { name: 'Los Angeles', mascot: 'Stars', abbrev: 'LAS', colors: ['#7c3aed', '#facc15'], prestige: 85 },
  { name: 'Chicago', mascot: 'Wind', abbrev: 'CHI', colors: ['#dc2626', '#0f172a'], prestige: 70 },
  { name: 'Boston', mascot: 'Harbor', abbrev: 'BOS', colors: ['#15803d', '#f8fafc'], prestige: 80 },
  { name: 'Miami', mascot: 'Surge', abbrev: 'MIA', colors: ['#db2777', '#0f172a'], prestige: 68 },
  { name: 'Denver', mascot: 'Peaks', abbrev: 'DEN', colors: ['#0ea5e9', '#fbbf24'], prestige: 66 },
  { name: 'Dallas', mascot: 'Outlaws', abbrev: 'DAL', colors: ['#2563eb', '#94a3b8'], prestige: 64 },
  { name: 'Seattle', mascot: 'Storm Kings', abbrev: 'SEA', colors: ['#166534', '#fde047'], prestige: 58 },
  { name: 'Toronto', mascot: 'Northmen', abbrev: 'TOR', colors: ['#b91c1c', '#e5e7eb'], prestige: 62 },
  { name: 'Phoenix', mascot: 'Flames', abbrev: 'PHX', colors: ['#ea580c', '#4c1d95'], prestige: 60 },
  { name: 'Detroit', mascot: 'Engines', abbrev: 'DET', colors: ['#1e3a8a', '#ef4444'], prestige: 50 },
  { name: 'Oakland', mascot: 'Redwoods', abbrev: 'OAK', colors: ['#14532d', '#fbbf24'], prestige: 72 },
];

export const TEAMS_BY_LEVEL: Record<Level, TeamTemplate[]> = {
  hs: HS_TEAMS,
  college: COLLEGE_TEAMS,
  pro: PRO_TEAMS,
};

export interface LevelConfig {
  label: string;
  leagueName: string;
  quarterMinutes: number;
  pace: number;
  rosterSize: number;
  /** mean overall of a generated starter; bench is lower */
  ratingMean: number;
  ratingSd: number;
  ageRange: [number, number];
  playoffTeams: number;
  maxYears: number;
}

export const LEVEL_CONFIG: Record<Level, LevelConfig> = {
  hs: {
    label: 'High School',
    leagueName: 'Metro Conference',
    quarterMinutes: 8,
    pace: 1,
    rosterSize: 10,
    ratingMean: 47,
    ratingSd: 7,
    ageRange: [14, 18],
    playoffTeams: 4,
    maxYears: 4,
  },
  college: {
    label: 'College',
    leagueName: 'National Collegiate Conference',
    quarterMinutes: 10,
    pace: 1.05,
    rosterSize: 11,
    ratingMean: 62,
    ratingSd: 6,
    ageRange: [18, 22],
    playoffTeams: 8,
    maxYears: 4,
  },
  pro: {
    label: 'Pro',
    leagueName: 'Professional Basketball League',
    quarterMinutes: 12,
    pace: 0.86,
    rosterSize: 12,
    ratingMean: 74,
    ratingSd: 5,
    ageRange: [20, 35],
    playoffTeams: 8,
    maxYears: 20,
  },
};

export const YEAR_LABELS: Record<Level, string[]> = {
  hs: ['Freshman', 'Sophomore', 'Junior', 'Senior'],
  college: ['Freshman', 'Sophomore', 'Junior', 'Senior'],
  pro: [],
};

export function yearLabel(level: Level, year: number): string {
  if (level === 'pro') return year === 1 ? 'Rookie' : `Year ${year}`;
  return YEAR_LABELS[level][year - 1] ?? `Year ${year}`;
}
