import { useRef, useState, type ChangeEvent } from 'react';

export interface LoadPanelProps {
  fenInput: string;
  fenError: string | null;
  pgnError: string | null;
  liveMode: boolean;
  onFenChange(text: string): void;
  onFenSubmit(): void;
  onLiveModeChange(on: boolean): void;
  onPgnLoad(pgn: string): boolean;
}

export function LoadPanel(props: LoadPanelProps) {
  const [pgnText, setPgnText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPgnText(text);
    props.onPgnLoad(text);
    e.target.value = '';
  };

  return (
    <section className="panel load-panel">
      <header className="panel-head">
        <span>Позиция (FEN)</span>
        <label className="toggle" title="Пересчитывать при каждом изменении FEN">
          <input type="checkbox" checked={props.liveMode} onChange={(e) => props.onLiveModeChange(e.target.checked)} />
          Live mode
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
        {props.fenError ? <span className="error">{props.fenError}</span> : <span className="muted small-text">Enter — анализировать</span>}
        {!props.liveMode && (
          <button className="small" onClick={props.onFenSubmit}>
            Анализ
          </button>
        )}
      </div>

      <header className="panel-head">
        <span>Партия (PGN)</span>
        <button className="small" onClick={() => fileRef.current?.click()}>
          Открыть файл…
        </button>
        <input ref={fileRef} type="file" accept=".pgn,text/plain" hidden onChange={onFile} />
      </header>
      <textarea
        className="pgn-input"
        value={pgnText}
        placeholder="Вставьте PGN сюда"
        spellCheck={false}
        rows={4}
        onChange={(e) => setPgnText(e.target.value)}
      />
      <div className="row">
        {props.pgnError ? <span className="error">{props.pgnError}</span> : <span />}
        <button className="small" disabled={!pgnText.trim()} onClick={() => props.onPgnLoad(pgnText)}>
          Загрузить PGN
        </button>
      </div>
    </section>
  );
}
