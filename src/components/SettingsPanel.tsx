import { useEffect, useState } from 'react';
import type { AppSettings } from '../core/analysis.manager';
import { SoundControls } from './SoundControls';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  hint?: string;
  onCommit(value: number): void;
}

/** Shows the value while dragging but only commits on release, so the engine isn't restarted per pixel. */
function Slider({ label, value, min, max, step = 1, unit = '', disabled, hint, onCommit }: SliderProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <label className={`slider${disabled ? ' disabled' : ''}`} title={hint}>
      <span className="slider-label">
        {label}
        <strong>
          {draft}
          {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

export interface SettingsPanelProps {
  settings: AppSettings;
  maxThreads: number;
  multiThreaded: boolean;
  onChange(patch: Partial<AppSettings>): void;
}

export function SettingsPanel({ settings, maxThreads, multiThreaded, onChange }: SettingsPanelProps) {
  return (
    <section className="panel settings-panel">
      <header className="panel-head">
        <span>Настройки движка</span>
      </header>
      <SoundControls />
      <div className="segmented-row">
        <span className="slider-label">Варианты</span>
        <div className="segmented" role="group" aria-label="Количество вариантов">
          {[1, 3, 5].map((n) => (
            <button key={n} className={settings.multiPv === n ? 'active' : ''} onClick={() => onChange({ multiPv: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <Slider label="Глубина" value={settings.depth} min={6} max={30} onCommit={(depth) => onChange({ depth })} />
      <Slider
        label="Глубина разбора партии"
        value={settings.reviewDepth}
        min={6}
        max={22}
        onCommit={(reviewDepth) => onChange({ reviewDepth })}
      />
      <Slider
        label="Потоки CPU"
        value={settings.threads}
        min={1}
        max={Math.max(1, maxThreads)}
        disabled={!multiThreaded}
        hint={multiThreaded ? undefined : 'Страница не cross-origin isolated — доступен только однопоточный движок'}
        onCommit={(threads) => onChange({ threads })}
      />
      <Slider label="Хеш" value={settings.hashMb} min={16} max={512} step={16} unit=" МБ" onCommit={(hashMb) => onChange({ hashMb })} />
      {!multiThreaded && <p className="muted small-text">Однопоточный режим: нет SharedArrayBuffer (нужны заголовки COOP/COEP).</p>}
    </section>
  );
}
