import { chesscom } from './chesscom';
import { lichess } from './lichess';
import type { Platform } from './types';

const PLATFORMS: readonly Platform[] = [chesscom, lichess];

export function platformFor(hostname: string): Platform | null {
  return PLATFORMS.find((p) => p.matchesHost(hostname)) ?? null;
}

export type { Platform, BoardSnapshot } from './types';
