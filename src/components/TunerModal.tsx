import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import { PitchDetector } from 'pitchy';
import type { NotationSystem } from '../types/music';
import { formatNoteName } from '../lib/musicTheory';
import { audioEngine } from '../lib/audioEngine';
import { ModalDialog } from './ModalDialog';

interface TunerModalProps {
  open: boolean;
  onClose: () => void;
  notation: NotationSystem;
}

interface TuningString {
  note: string;
  freq: number;
}

const TUNING_PRESETS: Record<string, { label: string; strings: TuningString[] }> = {
  guitar_std: {
    label: 'Chitarra Standard (EADGBE)',
    strings: [
      { note: 'E2', freq: 82.41 },
      { note: 'A2', freq: 110.0 },
      { note: 'D3', freq: 146.83 },
      { note: 'G3', freq: 196.0 },
      { note: 'B3', freq: 246.94 },
      { note: 'E4', freq: 329.63 },
    ],
  },
  ukulele_std: {
    label: 'Ukulele Standard (GCEA)',
    strings: [
      { note: 'G4', freq: 392.0 },
      { note: 'C4', freq: 261.63 },
      { note: 'E4', freq: 329.63 },
      { note: 'A4', freq: 440.0 },
    ],
  },
  guitar_drop_d: {
    label: 'Chitarra Drop D (DADGBE)',
    strings: [
      { note: 'D2', freq: 73.42 },
      { note: 'A2', freq: 110.0 },
      { note: 'D3', freq: 146.83 },
      { note: 'G3', freq: 196.0 },
      { note: 'B3', freq: 246.94 },
      { note: 'E4', freq: 329.63 },
    ],
  },
  chromatic: {
    label: 'Cromatico (Tutti gli strumenti)',
    strings: [],
  },
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function freqToNoteInfo(freq: number) {
  const midiFloat = 69 + 12 * Math.log2(freq / 440);
  const nearestMidi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - nearestMidi) * 100);
  const name = NOTE_NAMES[((nearestMidi % 12) + 12) % 12];
  const octave = Math.floor(nearestMidi / 12) - 1;
  return { note: `${name}${octave}`, cents, freq };
}

export function TunerModal({ open, onClose, notation }: TunerModalProps) {
  const [presetKey, setPresetKey] = useState<keyof typeof TUNING_PRESETS>('guitar_std');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<{ note: string; cents: number; freq: number } | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const stopListening = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setListening(false);
  };

  useEffect(() => {
    if (!open) {
      stopListening();
    }
    return () => stopListening();
  }, [open]);

  const startListening = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = audioEngine.getContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const input = new Float32Array(detector.inputLength);
      setListening(true);

      const update = () => {
        analyser.getFloatTimeDomainData(input);
        const [pitch, clarity] = detector.findPitch(input, ctx.sampleRate);
        if (clarity > 0.85 && pitch > 60 && pitch < 1200) {
          setDetected(freqToNoteInfo(pitch));
        }
        rafRef.current = requestAnimationFrame(update);
      };
      rafRef.current = requestAnimationFrame(update);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Impossibile accedere al microfono: ${err.message}`
          : 'Permesso microfono negato.'
      );
    }
  };

  const isInTune = detected !== null && Math.abs(detected.cents) <= 5;
  const clampedCents = detected ? Math.max(-50, Math.min(50, detected.cents)) : 0;
  const preset = TUNING_PRESETS[presetKey];

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Accordatore (Tuner)"
      subtitle="Usa il microfono per accordare Chitarra, Ukulele o controllare l'intonazione di qualsiasi nota"
    >
      <div className="space-y-5">
        {/* Preset selector */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(TUNING_PRESETS).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPresetKey(key)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer"
              style={{
                backgroundColor: presetKey === key ? 'var(--accent)' : 'var(--bg-surface-2)',
                borderColor: presetKey === key ? 'var(--accent)' : 'var(--border-color)',
                color: presetKey === key ? '#ffffff' : 'var(--text-primary)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Tuner Gauge */}
        <div
          className="rounded-2xl border p-6 flex flex-col items-center gap-4"
          style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
        >
          <div
            className="text-5xl font-black tracking-tight transition-colors"
            style={{
              color: isInTune ? '#10b981' : detected ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {detected ? formatNoteName(detected.note, notation) : '—'}
          </div>

          <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {detected ? (
              isInTune ? (
                <span className="text-emerald-500 font-bold">✓ Perfettamente accordata! ({detected.freq.toFixed(1)} Hz)</span>
              ) : detected.cents < 0 ? (
                <span>Troppo bassa ({detected.cents} cents) — Tira leggermente la corda ↑</span>
              ) : (
                <span>Troppo alta (+{detected.cents} cents) — Allenta leggermente la corda ↓</span>
              )
            ) : listening ? (
              'Suona una corda o una nota vicino al microfono...'
            ) : (
              'Attiva il microfono o clicca una corda qui sotto per ascoltare la nota di riferimento.'
            )}
          </div>

          {/* Cents meter bar */}
          <div className="w-full max-w-sm">
            <div className="relative h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-3)' }}>
              {/* Center green zone */}
              <div className="absolute left-[45%] right-[45%] top-0 bottom-0 bg-emerald-500/40" />
              {/* Needle */}
              <div
                className="absolute top-0 bottom-0 w-2 -ml-1 rounded-full transition-all duration-75"
                style={{
                  left: `${50 + clampedCents}%`,
                  backgroundColor: isInTune ? '#adc178' : '#a98467',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] mt-1 font-mono opacity-60">
              <span>-50¢ (Bassa)</span>
              <span>0¢</span>
              <span>+50¢ (Alta)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
            style={{ backgroundColor: listening ? '#ef4444' : 'var(--accent)' }}
          >
            {listening ? (
              <>
                <MicOff className="w-4 h-4" /> Ferma Microfono
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" /> Attiva Microfono
              </>
            )}
          </button>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>

        {/* Reference tones per string */}
        {preset.strings.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Note di riferimento (clicca per ascoltare a orecchio):
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {preset.strings.map((s, idx) => (
                <button
                  key={s.note + idx}
                  type="button"
                  onClick={() => audioEngine.playReferenceTone(s.freq)}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl border cursor-pointer hover:opacity-85"
                  style={{ backgroundColor: 'var(--bg-surface-2)', borderColor: 'var(--border-color)' }}
                >
                  <span className="text-sm font-bold">{formatNoteName(s.note, notation)}</span>
                  <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                    <Volume2 className="w-3 h-3" /> {Math.round(s.freq)}Hz
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
