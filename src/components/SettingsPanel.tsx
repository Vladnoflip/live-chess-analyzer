import { useEffect, useState } from 'react';
import type { AppSettings } from '../core/analysis.manager';
import { SoundControls } from './SoundControls';
import { useBoardTheme, useI18n } from '../hooks/useAnalysis';
import { BOARD_PALETTES, BOARD_THEMES, isBoardTheme } from '../core/board-themes';
import { isLocalePref } from '../core/i18n';

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
  const { t, pref, setPref } = useI18n();
  const { theme, setTheme } = useBoardTheme();
  return (
    <section className="panel settings-panel">
      <header className="panel-head">
        <span>{t('settings.title')}</span>
      </header>
      <label className="segmented-row language-row">
        <span className="slider-label">{t('settings.language')}</span>
        <select
          className="language-select"
          value={pref}
          onChange={(e) => {
            if (isLocalePref(e.target.value)) setPref(e.target.value);
          }}
        >
          <option value="auto">{t('lang.auto')}</option>
          <option value="en">{t('lang.en')}</option>
          <option value="ru">{t('lang.ru')}</option>
        </select>
      </label>
      <label className="segmented-row language-row">
        <span className="slider-label">{t('settings.boardTheme')}</span>
        <select
          className="language-select board-theme-select"
          value={theme}
          onChange={(e) => {
            if (isBoardTheme(e.target.value)) setTheme(e.target.value);
          }}
        >
          {BOARD_THEMES.map((id) => (
            <option key={id} value={id}>
              {t(BOARD_PALETTES[id].label)}
            </option>
          ))}
        </select>
      </label>
      <SoundControls />
      <div className="segmented-row">
        <span className="slider-label">{t('settings.variants')}</span>
        <div className="segmented" role="group" aria-label={t('settings.variantsLabel')}>
          {[1, 3, 5].map((n) => (
            <button key={n} className={settings.multiPv === n ? 'active' : ''} onClick={() => onChange({ multiPv: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <Slider label={t('settings.depth')} value={settings.depth} min={6} max={30} onCommit={(depth) => onChange({ depth })} />
      <Slider
        label={t('settings.reviewDepth')}
        value={settings.reviewDepth}
        min={6}
        max={22}
        onCommit={(reviewDepth) => onChange({ reviewDepth })}
      />
      <Slider
        label={t('settings.threads')}
        value={settings.threads}
        min={1}
        max={Math.max(1, maxThreads)}
        disabled={!multiThreaded}
        hint={multiThreaded ? undefined : t('settings.singleThreadHint')}
        onCommit={(threads) => onChange({ threads })}
      />
      <Slider label={t('settings.hash')} value={settings.hashMb} min={16} max={512} step={16} unit={t('settings.mb')} onCommit={(hashMb) => onChange({ hashMb })} />
      {!multiThreaded && <p className="muted small-text">{t('settings.singleThreadNote')}</p>}
    </section>
  );
}
