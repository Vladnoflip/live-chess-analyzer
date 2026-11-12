import { useRef, useState } from 'react';
import type { MoveClass } from '../core/types';
import { useI18n, useManager } from '../hooks/useAnalysis';
import {
  LICHESS_MAX_GAMES,
  LichessImportError,
  fetchLichessGames,
  isValidLichessUsername,
  type LichessGame,
} from '../services/lichess-import';

interface GameSummary {
  readonly blunders: number;
  readonly mistakes: number;
  readonly inaccuracies: number;
}

function summarize(classes: Readonly<Record<number, MoveClass>>): GameSummary {
  const all = Object.values(classes);
  return {
    blunders: all.filter((c) => c === 'blunder').length,
    mistakes: all.filter((c) => c === 'mistake').length,
    inaccuracies: all.filter((c) => c === 'inaccuracy').length,
  };
}

/**
 * Web app only: loads a user's last games from lichess and reviews them one by one.
 * The single optional network request of the app; the extension never renders this.
 */
export function LichessImportPanel() {
  const manager = useManager();
  const { t, locale } = useI18n();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LichessImportError['code'] | null>(null);
  const [games, setGames] = useState<readonly LichessGame[]>([]);
  const [summaries, setSummaries] = useState<Readonly<Record<string, GameSummary>>>({});
  const [running, setRunning] = useState<{ n: number; total: number } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = async () => {
    const name = username.trim();
    if (!isValidLichessUsername(name)) {
      setError('invalidUser');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchLichessGames(name, { max: LICHESS_MAX_GAMES });
      setGames(list);
      setSummaries({});
    } catch (e) {
      setError(e instanceof LichessImportError ? e.code : 'network');
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  const reviewOne = async (game: LichessGame): Promise<boolean> => {
    setActiveId(game.id);
    if (!manager.loadPgn(game.pgn)) return false;
    await manager.reviewGame();
    const { review, classes, moves } = manager.getState();
    // A cancelled review leaves running=false with done < total.
    if (review && review.done < review.total) return false;
    if (moves.length > 0) setSummaries((s) => ({ ...s, [game.id]: summarize(classes) }));
    return true;
  };

  const reviewAll = async () => {
    stopRef.current = false;
    for (let i = 0; i < games.length; i++) {
      if (stopRef.current) break;
      setRunning({ n: i + 1, total: games.length });
      const ok = await reviewOne(games[i] as LichessGame);
      if (!ok && stopRef.current) break;
    }
    setRunning(null);
  };

  const stop = () => {
    stopRef.current = true;
    manager.cancelReview();
  };

  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="panel lichess-panel">
      <header className="panel-head">
        <span>{t('lichess.title')}</span>
      </header>
      <p className="network-warning" role="note">
        <span aria-hidden="true">⚠</span> {t('lichess.warning')}
      </p>
      <form
        className="row lichess-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="visually-hidden" htmlFor="lichess-user">
          {t('lichess.username')}
        </label>
        <input
          id="lichess-user"
          className="lichess-user"
          value={username}
          placeholder={t('lichess.placeholder')}
          aria-label={t('lichess.username')}
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button className="small" type="submit" disabled={loading || !username.trim() || running !== null}>
          {loading ? t('lichess.loading') : t('lichess.import')}
        </button>
      </form>
      {error && <p className="error">{t(`lichess.error.${error}` as const)}</p>}
      {games.length > 0 && (
        <>
          <div className="row">
            {running ? (
              <>
                <span className="muted small-text">
                  <span className="spinner" /> {t('lichess.reviewing', { n: running.n, total: running.total })}
                </span>
                <button className="small" onClick={stop}>
                  {t('lichess.stop')}
                </button>
              </>
            ) : (
              <>
                <span />
                <button className="small" onClick={() => void reviewAll()}>
                  {t('lichess.reviewAll')}
                </button>
              </>
            )}
          </div>
          <ul className="lichess-games">
            {games.map((g) => {
              const sum = summaries[g.id];
              return (
                <li key={g.id} className={g.id === activeId ? 'active' : ''}>
                  <button className="link lichess-game" disabled={running !== null} title={t('lichess.open')} onClick={() => void reviewOne(g)}>
                    <span className="lichess-players">
                      {g.white} – {g.black}
                    </span>
                    <span className="muted small-text">
                      {g.result} · {g.speed} · {g.createdAt ? dateFmt.format(g.createdAt) : ''}
                    </span>
                  </button>
                  {sum && <span className="lichess-summary small-text">{t('lichess.summary', { ...sum })}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
