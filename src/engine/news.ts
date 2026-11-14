import type { GameState } from '../state/schemas';

/** Add a headline to the news feed, keeping only the most recent. */
export function addNews(state: GameState, text: string) {
  state.news.push({ season: state.career.season, week: state.career.week, text });
  if (state.news.length > 120) state.news.splice(0, state.news.length - 120);
}
