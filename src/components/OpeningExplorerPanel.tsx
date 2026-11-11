import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { BookMove, NameNode, OpeningEntry, OpeningFilter } from '../core/openings';
import { nameParts } from '../core/openings';
import type { ExplorerState, PositionOpening } from '../core/opening.explorer';
import { DRILL_SECTIONS } from '../core/drill.manager';
import { useI18n } from '../hooks/useAnalysis';

export interface OpeningExplorerPanelProps {
  state: ExplorerState;
  position: PositionOpening;
  moves: readonly BookMove[];
  tree: readonly NameNode[];
  canGoBack: boolean;
  search(query: string): readonly OpeningEntry[];
  onPlay(uci: string): void;
  onOpenLine(entry: OpeningEntry): void;
  onBack(): void;
  onRoot(): void;
  onFilter(patch: Partial<OpeningFilter>): void;
  onPreset(filter: OpeningFilter): void;
}

type Tab = 'moves' | 'tree';

export function OpeningExplorerPanel(props: OpeningExplorerPanelProps) {
  const { state, position, moves, canGoBack } = props;
  const f = state.filter;
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('moves');

  return (
    <section className="panel explorer-panel">
      <header className="panel-head">
        <span>{t('explorer.title')}</span>
        <span className="row-buttons">
          <button className="small" onClick={props.onBack} disabled={!canGoBack} title={t('explorer.backTitle')}>
            {t('explorer.back')}
          </button>
          <button className="small" onClick={props.onRoot}>
            {t('explorer.root')}
          </button>
        </span>
      </header>

      {state.status === 'loading' && <p className="muted small-text">{t('explorer.loading')}</p>}
      {state.status === 'error' && <p className="error">{state.error}</p>}

      <OpeningSearch search={props.search} onOpen={props.onOpenLine} />

      <div className={`theory-flag ${position.inBook ? 'in' : 'out'}`}>
        {position.inBook ? t('explorer.inBook') : t('explorer.outOfBook')}
        {position.opening && (
          <span>
            : <strong>{position.opening.name}</strong> <span className="eco">{position.opening.eco}</span>
          </span>
        )}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'moves'} className={tab === 'moves' ? 'active' : ''} onClick={() => setTab('moves')}>
          {t('explorer.tabMoves')}
        </button>
        <button role="tab" aria-selected={tab === 'tree'} className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}>
          {t('explorer.tabTree')}
        </button>
      </div>

      {tab === 'moves' ? (
        <>
          <div className="filters">
            <select
              value={DRILL_SECTIONS.find((s) => JSON.stringify(s.filter) === JSON.stringify(f))?.id ?? ''}
              onChange={(e) => {
                const s = DRILL_SECTIONS.find((x) => x.id === e.target.value);
                if (s) props.onPreset(s.filter);
              }}
              aria-label={t('explorer.section')}
            >
              <option value="">{t('explorer.sectionPlaceholder')}</option>
              {DRILL_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.title)}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder={t('explorer.search')}
              value={f.query ?? ''}
              onChange={(e) => props.onFilter({ query: e.target.value || undefined })}
            />
            <input
              className="eco-input"
              placeholder={t('explorer.ecoFrom')}
              maxLength={3}
              value={f.ecoFrom ?? ''}
              onChange={(e) => props.onFilter({ ecoFrom: e.target.value.toUpperCase() || undefined })}
            />
            <input
              className="eco-input"
              placeholder={t('explorer.ecoTo')}
              maxLength={3}
              value={f.ecoTo ?? ''}
              onChange={(e) => props.onFilter({ ecoTo: e.target.value.toUpperCase() || undefined })}
            />
            <select
              value={f.color ?? ''}
              onChange={(e) => props.onFilter({ color: e.target.value === 'w' || e.target.value === 'b' ? e.target.value : null })}
              aria-label={t('explorer.side')}
            >
              <option value="">{t('explorer.anySide')}</option>
              <option value="w">{t('explorer.forWhite')}</option>
              <option value="b">{t('explorer.forBlack')}</option>
            </select>
          </div>

          {moves.length === 0 ? (
            <p className="muted small-text">{position.inBook ? t('explorer.noFiltered') : t('explorer.noBook')}</p>
          ) : (
            <ul className="book-moves">
              {moves.map((m) => (
                <li key={m.uci}>
                  <button onClick={() => props.onPlay(m.uci)}>
                    <strong className="book-san">{m.san}</strong>
                    <span className="book-name">{m.opening?.name ?? '—'}</span>
                    <span className="eco">{m.opening?.eco ?? ''}</span>
                    <span className="muted small-text" title={t('explorer.linesTitle')}>
                      {m.lines}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <OpeningTree tree={props.tree} current={position.opening} onOpen={props.onOpenLine} />
      )}
    </section>
  );
}

/** Search box with autocomplete; picking a suggestion plays that opening's line on the board. */
function OpeningSearch({ search, onOpen }: { search(query: string): readonly OpeningEntry[]; onOpen(e: OpeningEntry): void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => (query.trim().length >= 2 ? search(query) : []), [query, search]);

  const pick = (e: OpeningEntry | undefined) => {
    if (!e) return;
    onOpen(e);
    setQuery(e.name);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Enter') pick(results[active]);
    else if (e.key === 'Escape') setOpen(false);
    else return;
    e.preventDefault();
  };

  return (
    <div className="opening-search">
      <input
        type="search"
        value={query}
        placeholder={t('explorer.searchOpenings')}
        aria-label={t('explorer.searchOpenings')}
        aria-autocomplete="list"
        aria-expanded={open && results.length > 0}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {open && query.trim().length >= 2 && (
        <ul className="suggestions" role="listbox">
          {results.length === 0 ? (
            <li className="muted small-text">{t('explorer.noResults')}</li>
          ) : (
            results.map((r, i) => (
              <li key={r.name} role="option" aria-selected={i === active}>
                <button className={i === active ? 'active' : ''} onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(r)}>
                  <span className="eco">{r.eco}</span>
                  <span className="suggestion-name">{r.name}</span>
                  <span className="suggestion-line muted small-text">{formatLine(r.san, 8)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Collapsible name tree; the path to the current position's opening is expanded automatically. */
function OpeningTree({ tree, current, onOpen }: { tree: readonly NameNode[]; current: OpeningEntry | null; onOpen(e: OpeningEntry): void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!current) return;
    const parts = nameParts(current.name);
    const paths = parts.slice(0, -1).map((_, i) => (i === 0 ? parts[0]! : `${parts[0]}: ${parts.slice(1, i + 1).join(', ')}`));
    setExpanded((prev) => new Set([...prev, ...paths]));
  }, [current]);

  const toggle = (fullName: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });

  const render = (nodes: readonly NameNode[]) => (
    <ul className="name-tree">
      {nodes.map((n) => {
        const isOpen = expanded.has(n.fullName);
        const isCurrent = current?.name === n.fullName;
        return (
          <li key={n.fullName}>
            <div className={`tree-row${isCurrent ? ' current' : ''}`}>
              {n.children.length > 0 ? (
                <button className="twisty" aria-expanded={isOpen} title={isOpen ? t('explorer.collapse') : t('explorer.expand')} onClick={() => toggle(n.fullName)}>
                  {isOpen ? '▾' : '▸'}
                </button>
              ) : (
                <span className="twisty-spacer" />
              )}
              <button className="tree-label" onClick={() => onOpen(n.entry ?? n.first)} title={(n.entry ?? n.first).san.join(' ')}>
                {n.label}
              </button>
              <span className="eco">{n.ecoFrom === n.ecoTo ? n.ecoFrom : `${n.ecoFrom}–${n.ecoTo}`}</span>
              <span className="muted small-text">{t('explorer.lines', { n: n.count })}</span>
            </div>
            {isOpen && n.children.length > 0 && render(n.children)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="tree-wrap">
      <p className="muted small-text">{t('explorer.treeHint')}</p>
      {render(tree)}
    </div>
  );
}

/** "1.e4 c5 2.Nf3 d6 …" — the first `maxPlies` moves of a line. */
function formatLine(san: readonly string[], maxPlies: number): string {
  const parts = san.slice(0, maxPlies).map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m));
  return parts.join(' ') + (san.length > maxPlies ? ' …' : '');
}
