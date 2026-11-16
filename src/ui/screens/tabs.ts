import type { Tab } from '../../state/store';

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'hub', label: 'This Week', icon: '📅' },
  { id: 'paper', label: 'Newspaper', icon: '📰' },
  { id: 'profile', label: 'Player', icon: '⛹️' },
  { id: 'relationships', label: 'People', icon: '🤝' },
  { id: 'story', label: 'Story', icon: '📖' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'league', label: 'League', icon: '🏆' },
  { id: 'stats', label: 'Stats', icon: '📊' },
  { id: 'media', label: 'Media', icon: '📱' },
  { id: 'money', label: 'Money', icon: '💰' },
  { id: 'recruiting', label: 'Recruiting', icon: '🎯' },
  { id: 'help', label: 'Guide', icon: '❓' },
];

/** The menu, grouped: a row of groups, and under it the pages of the open one. */
export const GROUPS: { id: string; label: string; icon: string; tabs: Tab[] }[] = [
  { id: 'play', label: 'Play', icon: '🏀', tabs: ['hub', 'paper'] },
  { id: 'career', label: 'Career', icon: '⛹️', tabs: ['profile', 'relationships', 'story', 'memory'] },
  { id: 'league', label: 'League', icon: '🏆', tabs: ['league', 'stats'] },
  { id: 'life', label: 'Life', icon: '💼', tabs: ['media', 'money', 'recruiting'] },
  { id: 'help', label: 'Guide', icon: '❓', tabs: ['help'] },
];

export const groupOf = (tab: Tab) => GROUPS.find((g) => g.tabs.includes(tab)) ?? GROUPS[0];

/** The four tabs a phone keeps on its bottom bar. Everything else lives under "More". */
export const PRIMARY_TABS: Tab[] = ['hub', 'profile', 'league', 'paper'];
