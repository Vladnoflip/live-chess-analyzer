import { useState } from 'react';
import type { GuessState } from '../core/guess.manager';
import type { Color } from '../core/types';
import type { Msg } from '../core/i18n';
import { formatScore } from '../core/format';
import { useI18n } from '../hooks/useAnalysis';

export interface GuessPanelProps {
  state: GuessState;
  accuracy: number;
  /** A game is loaded on the analysis board and can be used. */
  hasLoadedGame: boolean;
  pgnError: Msg | null;
  onStartPgn(pgn: string, side: Color): void;
  onStartLoaded(side: Color): void;
  onNext(): void;
  onStop(): void;
}

export function GuessPanel({ state, accuracy, hasLoadedGame, pgnError, onStartPgn, onStartLoaded, onNext, onStop }: GuessPanelProps) {
  const { t, text } = useI18n();
  const [pgn, setPgn] = useState('');
  const [side, setSide] = useState<Color>('w');
  const done = state.results.length;
  const ok = state.results.filter((r) => r.verdict !== 'miss').length;
  const active = state.status !== 'idle';

  return (
    <section className="panel guess-panel">
      <header className="panel-head">
        <span>{t('guess.title')}</span>
        {active && state.status !== 'finished' && (
          <span className="muted small-text">
            {t('guess.progress', { n: Math.min(state.status === 'feedback' ? done : done + 1, state.total), total: state.total })} · {t('guess.score', { ok, done })}
          </span>
        )}
      </header>

      {(state.status === 'idle' || state.status === 'finished') && (
        <div className="guess-setup">
          {state.status === 'finished' ? (
            <p className="guess-result tone-good">{t('guess.finished', { ok, total: state.total, pct: accuracy })}</p>
          ) : (
            <p className="muted small-text">{t('guess.intro')}</p>
          )}
          <textarea
            className="pgn-input guess-pgn"
            value={pgn}
            placeholder={t('guess.pgnPlaceholder')}
            spellCheck={false}
            rows={4}
            onChange={(e) => setPgn(e.target.value)}
          />
          {pgnError && <p className="error">{text(pgnError)}</p>}
          {state.error && <p className="error">{text(state.error)}</p>}
          <div className="segmented-row">
            <span className="slider-label">{t('guess.side')}</span>
            <div className="segmented" role="group" aria-label={t('guess.side')}>
              {(['w', 'b'] as const).map((c) => (
                <button key={c} className={side === c ? 'active' : ''} onClick={() => setSide(c)}>
                  {t(c === 'w' ? 'guess.white' : 'guess.black')}
                </button>
              ))}
            </div>
          </div>
          <div className="row-buttons">
            <button className="small primary" disabled={!pgn.trim()} onClick={() => onStartPgn(pgn, side)}>
              {state.status === 'finished' ? t('guess.again') : t('guess.start')}
            </button>
            {hasLoadedGame && (
              <button className="small" onClick={() => onStartLoaded(side)}>
                {t('guess.useLoaded')}
              </button>
            )}
          </div>
        </div>
      )}

      {active && state.status !== 'finished' && (
        <div className="guess-play">
          {state.status === 'guessing' && <p className="guess-prompt">{t(state.side === 'w' ? 'guess.prompt.w' : 'guess.prompt.b')}</p>}
          {state.status === 'checking' && (
            <p className="muted">
              <span className="spinner" /> {t('guess.checking')}
            </p>
          )}
          {state.error && <p className="error">{text(state.error)}</p>}
          {state.status === 'feedback' && state.last && (
            <div className={`guess-feedback verdict-${state.last.verdict}`}>
              <p className={state.last.verdict === 'miss' ? 'tone-bad' : 'tone-good'}>
                {state.last.verdict === 'match'
                  ? t('guess.match', { san: state.last.gameSan })
                  : state.last.verdict === 'good'
                    ? t('guess.good', { user: state.last.userSan, game: state.last.gameSan })
                    : t('guess.miss', { game: state.last.gameSan })}
              </p>
              {state.last.userScore && state.last.gameScore && (
                <p className="muted small-text">
                  {t('guess.evals', {
                    user: state.last.userSan,
                    userEval: formatScore(state.last.userScore),
                    game: state.last.gameSan,
                    gameEval: formatScore(state.last.gameScore),
                  })}
                </p>
              )}
            </div>
          )}
          <div className="row-buttons">
            {state.status === 'feedback' && (
              <button className="small primary" autoFocus onClick={onNext}>
                {t('guess.next')}
              </button>
            )}
            <button className="small" onClick={onStop}>
              {t('guess.stop')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
