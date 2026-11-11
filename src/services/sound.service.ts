import { Store } from '../core/observable';
import type { GameMove } from './board.service';

/**
 * Move sounds synthesized with the Web Audio API: a short wooden "knock" (band-passed
 * noise + a low body thump) and small tones. Original sounds — no audio files are
 * bundled or downloaded.
 */
export type SoundKind = 'move' | 'capture' | 'castle' | 'check' | 'promote' | 'mate' | 'error';

/** Which sound a move makes, from its SAN (checkmate > check > castling > promotion > capture). */
export function soundForSan(san: string): SoundKind {
  if (san.includes('#')) return 'mate';
  if (san.includes('+')) return 'check';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('=')) return 'promote';
  if (san.includes('x')) return 'capture';
  return 'move';
}

export interface SoundSettings {
  readonly enabled: boolean;
  /** 0..100 */
  readonly volume: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'livechess.sound.v1';

interface KnockOptions {
  /** Centre of the band-passed noise "click". */
  readonly freq: number;
  readonly q: number;
  readonly gain: number;
  readonly decay: number;
  /** Pitch of the low body thump. */
  readonly body: number;
}

const KNOCK_MOVE: KnockOptions = { freq: 1500, q: 1.2, gain: 0.6, decay: 0.05, body: 190 };
const KNOCK_CAPTURE: KnockOptions = { freq: 2300, q: 0.9, gain: 0.85, decay: 0.06, body: 150 };
const KNOCK_CAPTURE_2: KnockOptions = { freq: 900, q: 1, gain: 0.45, decay: 0.05, body: 115 };

export class SoundService extends Store<SoundSettings> {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private readonly storage: KeyValueStorage | null = null) {
    super({ enabled: true, volume: 70 });
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object') {
        const s = saved as Partial<Record<keyof SoundSettings, unknown>>;
        this.setState({
          enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
          volume: typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 100 ? s.volume : 70,
        });
      }
    } catch {
      // Unreadable settings: keep defaults.
    }
  }

  update(patch: Partial<SoundSettings>): void {
    this.setState(patch);
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.getState()));
    } catch {
      // Storage blocked: the setting lasts for this session only.
    }
  }

  /**
   * Browsers only allow audio after a user gesture; call this from one (the first
   * click on the board does it) so later engine/bot moves can play.
   */
  unlock(): void {
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  play(kind: SoundKind): void {
    const { enabled, volume } = this.getState();
    if (!enabled || volume <= 0) return;
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') return;
    const v = (volume / 100) ** 1.5; // perceptual-ish volume curve
    const t = ctx.currentTime + 0.005;
    switch (kind) {
      case 'move':
        this.knock(t, KNOCK_MOVE, v);
        break;
      case 'capture':
        this.knock(t, KNOCK_CAPTURE, v);
        this.knock(t + 0.035, KNOCK_CAPTURE_2, v);
        break;
      case 'castle':
        this.knock(t, KNOCK_MOVE, v);
        this.knock(t + 0.11, KNOCK_MOVE, v * 0.85);
        break;
      case 'check':
        this.knock(t, KNOCK_MOVE, v);
        this.tone(t + 0.03, 988, 988, 0.16, 'sine', 0.16 * v);
        break;
      case 'promote':
        this.knock(t, KNOCK_MOVE, v);
        this.tone(t + 0.03, 660, 990, 0.2, 'triangle', 0.14 * v);
        break;
      case 'mate':
        this.knock(t, KNOCK_CAPTURE, v);
        this.tone(t + 0.06, 523.25, 523.25, 0.35, 'sine', 0.14 * v);
        this.tone(t + 0.16, 659.25, 659.25, 0.35, 'sine', 0.12 * v);
        this.tone(t + 0.26, 783.99, 783.99, 0.5, 'sine', 0.12 * v);
        break;
      case 'error':
        this.tone(t, 220, 180, 0.18, 'triangle', 0.18 * v);
        break;
    }
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!AC) return null;
    this.ctx = new AC();
    // 0.2 s of white noise, reused for every knock.
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.2), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return this.ctx;
  }

  private knock(t: number, o: KnockOptions, v: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.freq;
    bp.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.decay);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + o.decay + 0.02);

    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(o.body, t);
    body.frequency.exponentialRampToValueAtTime(o.body * 0.6, t + 0.08);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(o.gain * 0.7 * v, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    body.connect(bg).connect(ctx.destination);
    body.start(t);
    body.stop(t + 0.1);
  }

  private tone(t: number, from: number, to: number, dur: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

interface MoveSource {
  getState(): { readonly ply: number; readonly moves: readonly GameMove[] };
  subscribe(listener: (s: { readonly ply: number; readonly moves: readonly GameMove[] }) => void): () => void;
}

interface ErrorSource {
  getState(): { readonly stats: { readonly errors: number } };
  subscribe(listener: (s: { readonly stats: { readonly errors: number } }) => void): () => void;
}

/**
 * Plays a sound whenever the position advances by exactly one move (a move on the
 * board, the trainer's reply, stepping forward through a game). Jumps and going back
 * stay silent. Optional: a soft "wrong" tone on trainer mistakes.
 */
export function bindSounds(sound: Pick<SoundService, 'play'>, moves: MoveSource, drill?: ErrorSource): () => void {
  let prev = moves.getState();
  const offMoves = moves.subscribe((s) => {
    const before = prev;
    prev = s;
    if (s.ply !== before.ply + 1) return;
    const move = s.moves[s.ply - 1];
    // Same ply number but a different game (new line loaded) is not a move.
    if (!move || (before.ply > 0 && before.moves[before.ply - 1]?.fenAfter !== move.fenBefore)) return;
    sound.play(soundForSan(move.san));
  });
  if (!drill) return offMoves;
  let errors = drill.getState().stats.errors;
  const offDrill = drill.subscribe((s) => {
    if (s.stats.errors > errors) sound.play('error');
    errors = s.stats.errors;
  });
  return () => {
    offMoves();
    offDrill();
  };
}
