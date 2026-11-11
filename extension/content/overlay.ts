import type { Square } from 'chess.js';
import type { Color, Score } from '../../src/core/types';
import { formatScore, whiteBarPercent } from '../../src/core/format';
import { arrowShape, pointsAttr, squareCenter } from '../../src/core/arrow-geometry';
import { textColorOn } from '../../src/core/move-score';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAR_WIDTH = 16;
const BAR_GAP = 6;
const PANEL_WIDTH = 168;

const STYLE = `
:host { all: initial; }
.layer { position: fixed; pointer-events: none; z-index: 2147483000; font-family: var(--lca-font, system-ui, sans-serif); font-size: calc(12px * var(--lca-scale, 1)); line-height: 1.3; }
svg.arrows { position: fixed; pointer-events: none; overflow: visible; }
.arrow { opacity: .95; filter: drop-shadow(0 .03px .035px rgba(0,0,0,.55)); }
.arrow.glow { filter: drop-shadow(0 0 .08px #00bfff) drop-shadow(0 0 .14px #00bfff); }
.badge text { font: 700 .19px var(--lca-font, system-ui, sans-serif); }
.bar { position: fixed; background: #3a3a3a; border-radius: 3px; overflow: hidden;
  display: flex; flex-direction: column-reverse; box-shadow: 0 0 0 1px rgba(0,0,0,.35); font-weight: 700; font-size: 9px; line-height: 1; }
.bar.flipped { flex-direction: column; }
.fill { background: #f2f2f2; transition: height .6s cubic-bezier(.22,1,.36,1); }
.label { position: absolute; left: 0; right: 0; text-align: center; }
.label.white { bottom: 3px; color: #222; }
.label.black { top: 3px; color: #eee; }
.bar.flipped .label.white { bottom: auto; top: 3px; }
.bar.flipped .label.black { top: auto; bottom: 3px; }
.spinner { position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; margin: -6px 0 0 -6px;
  border: 2px solid rgba(128,128,128,.4); border-top-color: #4f9dff; border-radius: 50%; animation: spin .8s linear infinite; }
.error { position: absolute; left: 0; right: 0; top: 50%; text-align: center; color: #f85149; font-size: 12px; }
.panel { position: fixed; width: ${PANEL_WIDTH}px; background: rgba(31,34,41,.92); color: #e6e8ec; border-radius: 6px;
  padding: 6px 8px; box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.row { display: grid; grid-template-columns: 44px 1fr 24px; gap: 6px; align-items: center; padding: 2px 0; }
.san { font-weight: 700; }
.evl { color: #aab; font-size: .92em; }
.track { grid-column: 1 / 3; height: 5px; background: #16181d; border-radius: 3px; overflow: hidden; }
.track span { display: block; height: 100%; border-radius: 3px; }
.num { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.opening { position: fixed; max-width: 360px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: rgba(31,34,41,.92); color: #e6e8ec; border-radius: 4px; padding: 2px 6px; font-size: .92em; }
@keyframes spin { to { transform: rotate(360deg); } }
`;

export interface OverlayArrow {
  readonly from: Square;
  readonly to: Square;
  readonly color: string;
  /** 0..100 shown in the badge. */
  readonly score: number;
  readonly accent: boolean;
  readonly glow: boolean;
}

export interface OverlayLine {
  readonly san: string;
  readonly score: Score;
  readonly moveScore: number;
  readonly color: string;
  readonly brilliant: boolean;
}

export interface OverlayState {
  readonly rect: DOMRect;
  readonly orientation: Color;
  readonly score: Score | null;
  readonly loading: boolean;
  readonly error: boolean;
  readonly showBar: boolean;
  /** Best first; drawn in reverse so the accented arrow ends up on top. */
  readonly arrows: readonly OverlayArrow[];
  /** null hides the panel. */
  readonly lines: readonly OverlayLine[] | null;
  /** "Nimzo-Indian Defense, E20" while in book; null otherwise. */
  readonly opening: string | null;
  /** CSS font-family stack and size multiplier. */
  readonly font: string;
  readonly fontScale: number;
}

/** Eval bar, candidate arrows, variants panel and opening label in a closed shadow root. */
export class Overlay {
  private readonly host: HTMLElement;
  private readonly bar: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLSpanElement;
  private readonly spinner: HTMLDivElement;
  private readonly errorMark: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly panel: HTMLDivElement;
  private readonly openingEl: HTMLDivElement;
  private readonly layer: HTMLDivElement;

  constructor() {
    this.host = document.createElement('livechess-analyzer-overlay');
    const root = this.host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${STYLE}</style>`;
    const layer = div('layer');
    this.layer = layer;
    this.bar = div('bar');
    this.fill = div('fill');
    this.label = document.createElement('span');
    this.label.className = 'label';
    this.spinner = div('spinner');
    this.errorMark = div('error');
    this.errorMark.textContent = '!';
    this.bar.append(this.fill, this.label, this.spinner, this.errorMark);
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('arrows');
    this.svg.setAttribute('viewBox', '0 0 8 8');
    this.panel = div('panel');
    this.openingEl = div('opening');
    layer.append(this.bar, this.svg, this.panel, this.openingEl);
    root.append(layer);
  }

  render(state: OverlayState): void {
    if (!this.host.isConnected) document.documentElement.append(this.host);
    this.host.style.display = '';
    const { rect } = state;
    this.layer.style.setProperty('--lca-font', state.font);
    this.layer.style.setProperty('--lca-scale', String(state.fontScale));

    // Readable state on the host for debugging/e2e tests (the shadow root is closed).
    const d = this.host.dataset;
    d.status = state.error ? 'error' : state.loading ? 'searching' : 'done';
    d.arrow = state.arrows[0] ? `${state.arrows[0].from}${state.arrows[0].to}` : '';
    d.arrows = String(state.arrows.length);
    d.lines = state.lines ? JSON.stringify(state.lines.map((l) => [l.san, l.moveScore, l.color])) : '';
    d.opening = state.opening ?? '';
    d.font = state.font;

    const barLeft = rect.left >= BAR_WIDTH + BAR_GAP ? rect.left - BAR_WIDTH - BAR_GAP : rect.left + 2;
    place(this.bar, barLeft, rect.top, BAR_WIDTH, rect.height);
    this.bar.style.display = state.showBar ? '' : 'none';
    this.bar.classList.toggle('flipped', state.orientation === 'b');
    const white = whiteBarPercent(state.score);
    this.fill.style.height = `${white}%`;
    this.label.textContent = state.score ? formatScore(state.score).replace(/^\+/, '') : '';
    this.label.className = `label ${white >= 50 ? 'white' : 'black'}`;
    this.spinner.style.display = state.loading && !state.error ? '' : 'none';
    this.errorMark.style.display = state.error ? '' : 'none';

    place(this.svg, rect.left, rect.top, rect.width, rect.height);
    // Bodies (best on top), then all badges above them at full opacity.
    const ordered = [...state.arrows].reverse();
    this.svg.replaceChildren(
      ...ordered.map((a) => arrowEl(a, state.orientation)),
      ...ordered.map((a) => badgeEl(a, state.orientation)),
    );
    d.badges = String(this.svg.querySelectorAll('g.badge').length);

    if (state.lines && state.lines.length > 0) {
      // Right of the board when there is room, otherwise inside its top-right corner.
      const outside = rect.right + 8 + PANEL_WIDTH <= window.innerWidth;
      place(this.panel, outside ? rect.right + 8 : rect.right - PANEL_WIDTH - 4, rect.top + (outside ? 0 : 4));
      this.panel.replaceChildren(...state.lines.map(rowEl));
      this.panel.style.display = '';
    } else {
      this.panel.style.display = 'none';
    }

    if (state.opening) {
      place(this.openingEl, barLeft, Math.max(0, rect.top - 20));
      this.openingEl.textContent = state.opening;
      this.openingEl.style.display = '';
    } else {
      this.openingEl.style.display = 'none';
    }
  }

  hide(): void {
    this.host.style.display = 'none';
  }

  destroy(): void {
    this.host.remove();
  }
}

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function place(el: HTMLElement | SVGElement, left: number, top: number, width?: number, height?: number): void {
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  if (width !== undefined) el.style.width = `${width}px`;
  if (height !== undefined) el.style.height = `${height}px`;
}

function rowEl(line: OverlayLine): HTMLDivElement {
  const row = div('row');
  const san = document.createElement('span');
  san.className = 'san';
  san.textContent = line.san + (line.brilliant ? '!!' : '');
  if (line.brilliant) san.style.color = line.color;
  const evl = document.createElement('span');
  evl.className = 'evl';
  evl.textContent = formatScore(line.score);
  const num = document.createElement('span');
  num.className = 'num';
  num.style.color = line.color;
  num.textContent = String(line.moveScore);
  const track = div('track');
  const fill = document.createElement('span');
  fill.style.width = `${Math.max(3, line.moveScore)}%`;
  fill.style.background = line.color;
  track.append(fill);
  row.append(san, evl, num, track);
  return row;
}

/** Rounded shaft (bent for knight moves) + softened head; same opacity for all arrows. */
function arrowEl(a: OverlayArrow, orientation: Color): SVGGElement {
  const shape = arrowShape(squareCenter(a.from, orientation), squareCenter(a.to, orientation), a.accent);
  const g = svgEl('g', { class: `arrow${a.glow ? ' glow' : ''}` });
  g.append(
    svgEl('polyline', {
      points: pointsAttr(shape.shaft),
      fill: 'none',
      stroke: a.color,
      'stroke-width': String(shape.width),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
    svgEl('polygon', { points: pointsAttr(shape.head), fill: a.color, stroke: a.color, 'stroke-width': '0.06', 'stroke-linejoin': 'round' }),
  );
  return g;
}

/** 0–100 score next to the arrow, before the head. */
function badgeEl(a: OverlayArrow, orientation: Color): SVGGElement {
  const { badge } = arrowShape(squareCenter(a.from, orientation), squareCenter(a.to, orientation), a.accent);
  const g = svgEl('g', { class: 'badge' });
  g.append(
    svgEl('circle', { cx: String(badge.x), cy: String(badge.y), r: '0.2', fill: a.color, stroke: 'rgba(0,0,0,.35)', 'stroke-width': '0.025' }),
    svgEl('text', { x: String(badge.x), y: String(badge.y + 0.005), fill: textColorOn(a.color), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, String(a.score)),
  );
  return g;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}
