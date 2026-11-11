import { whiteWinChance } from './classification';
import { MATED_CP, type MoveClass, type Score } from './types';

/** "+0.35", "-1.20", "#3", "#-2", "1-0" (already mated). */
export function formatScore(score: Score | null): string {
  if (!score) return '…';
  if (score.kind === 'mate') return score.value > 0 ? `#${score.value}` : `#-${Math.abs(score.value)}`;
  if (score.value >= MATED_CP) return '1-0';
  if (score.value <= -MATED_CP) return '0-1';
  const pawns = score.value / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

/** Share of the eval bar filled by White, 0..100. */
export function whiteBarPercent(score: Score | null): number {
  return score ? whiteWinChance(score) : 50;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

export function formatCount(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

export const MOVE_CLASS_LABEL: Record<MoveClass, { label: string; symbol: string }> = {
  brilliant: { label: 'Блестящий', symbol: '!!' },
  best: { label: 'Лучший', symbol: '★' },
  good: { label: 'Хороший', symbol: '✓' },
  inaccuracy: { label: 'Неточность', symbol: '?!' },
  mistake: { label: 'Ошибка', symbol: '?' },
  blunder: { label: 'Зевок', symbol: '??' },
};
