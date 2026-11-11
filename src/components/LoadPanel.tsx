import { useRef, useState, type ChangeEvent } from 'react';
import type { Msg } from '../core/i18n';
import { useI18n } from '../hooks/useAnalysis';

export interface LoadPanelProps {
  fenInput: string;
  fenError: Msg | null;
  pgnError: Msg | null;
  liveMode: boolean;
  onFenChange(text: string): void;
  onFenSubmit(): void;
  onLiveModeChange(on: boolean): void;
  onPgnLoad(pgn: string): boolean;
}

export function LoadPanel(props: LoadPanelProps) {
  const { t, text } = useI18n();
  const [pgnText, setPgnText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setPgnText(content);
    props.onPgnLoad(content);
    e.target.value = '';
  };

  return (
    <section className="panel load-panel">
      <header className="panel-head">
        <span>{t('load.fen')}</span>
        <label className="toggle" title={t('load.liveHint')}>
          <input type="checkbox" checked={props.liveMode} onChange={(e) => props.onLiveModeChange(e.target.checked)} />
          {t('load.liveMode')}
        </label>
      </header>
      <textarea
        className={`fen-input${props.fenError ? ' invalid' : ''}`}
        value={props.fenInput}
        spellCheck={false}
        rows={2}
        onChange={(e) => props.onFenChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            props.onFenSubmit();
          }
        }}
      />
      <div className="row">
        {props.fenError ? <span className="error">{text(props.fenError)}</span> : <span className="muted small-text">{t('load.enterHint')}</span>}
        {!props.liveMode && (
          <button className="small" onClick={props.onFenSubmit}>
            {t('load.analyse')}
          </button>
        )}
      </div>

      <header className="panel-head">
        <span>{t('load.pgn')}</span>
        <button className="small" onClick={() => fileRef.current?.click()}>
          {t('load.openFile')}
        </button>
        <input ref={fileRef} type="file" accept=".pgn,text/plain" hidden onChange={onFile} />
      </header>
      <textarea
        className="pgn-input"
        value={pgnText}
        placeholder={t('load.pgnPlaceholder')}
        spellCheck={false}
        rows={4}
        onChange={(e) => setPgnText(e.target.value)}
      />
      <div className="row">
        {props.pgnError ? <span className="error">{text(props.pgnError)}</span> : <span />}
        <button className="small" disabled={!pgnText.trim()} onClick={() => props.onPgnLoad(pgnText)}>
          {t('load.loadPgn')}
        </button>
      </div>
    </section>
  );
}
