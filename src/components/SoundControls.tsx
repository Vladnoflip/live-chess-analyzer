import { useServices, useSound } from '../hooks/useAnalysis';

/** Sound on/off + volume; shared by the app settings and the trainer site header. */
export function SoundControls({ compact = false }: { compact?: boolean }) {
  const { sound } = useServices();
  const { enabled, volume } = useSound();
  return (
    <div className={`sound-controls${compact ? ' compact' : ''}`}>
      <button
        className="sound-toggle"
        onClick={() => {
          sound.update({ enabled: !enabled });
          sound.unlock();
          if (!enabled) sound.play('move');
        }}
        title={enabled ? 'Выключить звук ходов' : 'Включить звук ходов'}
        aria-pressed={enabled}
      >
        {enabled ? '🔊' : '🔇'}
        {!compact && <span>{enabled ? ' Звук ходов' : ' Звук выключен'}</span>}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        disabled={!enabled}
        aria-label="Громкость"
        onChange={(e) => sound.update({ volume: Number(e.target.value) })}
        onPointerUp={() => sound.play('capture')}
      />
    </div>
  );
}
