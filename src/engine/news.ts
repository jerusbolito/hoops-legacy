import type { GameState } from '../state/schemas';

export type TransactionKind = GameState['transactions'][number]['kind'];

/** Log a move around the league and headline it. */
export function logTransaction(state: GameState, kind: TransactionKind, text: string) {
  state.transactions.push({ season: state.career.season, week: state.career.week, kind, text });
  if (state.transactions.length > 80) state.transactions.splice(0, state.transactions.length - 80);
  addNews(state, text);
}

/** Add a headline to the news feed, keeping only the most recent. */
export function addNews(state: GameState, text: string) {
  state.news.push({ season: state.career.season, week: state.career.week, text });
  if (state.news.length > 120) state.news.splice(0, state.news.length - 120);
}
