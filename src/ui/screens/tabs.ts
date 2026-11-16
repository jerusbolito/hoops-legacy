import type { Tab } from '../../state/store';

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'hub', label: 'This Week', icon: '📅' },
  { id: 'profile', label: 'Player', icon: '⛹️' },
  { id: 'relationships', label: 'People', icon: '🤝' },
  { id: 'league', label: 'League', icon: '🏆' },
  { id: 'paper', label: 'Newspaper', icon: '📰' },
  { id: 'records', label: 'Records', icon: '🏅' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'media', label: 'Media', icon: '📱' },
  { id: 'money', label: 'Money', icon: '💰' },
  { id: 'recruiting', label: 'Recruiting', icon: '🎯' },
  { id: 'story', label: 'Story', icon: '📖' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
];

/** The four tabs a phone keeps on its bottom bar. Everything else lives under "More". */
export const PRIMARY_TABS: Tab[] = ['hub', 'profile', 'league', 'paper'];
