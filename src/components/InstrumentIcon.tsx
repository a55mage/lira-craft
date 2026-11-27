import type { Instrument } from '../types/music';

interface InstrumentIconProps {
  instrument: Instrument;
  className?: string;
}

export function InstrumentIcon({ instrument, className = 'w-4 h-4' }: InstrumentIconProps) {
  if (instrument === 'piano') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
        <path d="M7.5 4.5v9.5M12 4.5v9.5M16.5 4.5v9.5" />
        <rect x="6" y="4.5" width="3" height="8" rx="0.6" fill="currentColor" stroke="none" />
        <rect x="10.5" y="4.5" width="3" height="8" rx="0.6" fill="currentColor" stroke="none" />
        <rect x="15" y="4.5" width="3" height="8" rx="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (instrument === 'guitar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
        <path d="M18.5 3.5l2 2-5.2 5.2" />
        <path d="M13.5 9.2c-1.8-.4-3.7.4-4.6 2-.7 1.2-.5 2.4-1.3 3.2-.8.8-2 .6-3.1 1.5-1.4 1.1-1.6 3.3-.2 4.7 1.4 1.4 3.6 1.2 4.7-.2.9-1.1.7-2.3 1.5-3.1.8-.8 2-.6 3.2-1.3 1.6-.9 2.4-2.8 2-4.6" />
        <circle cx="9.6" cy="14.4" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Ukulele (compact 4-string acoustic silhouette)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M17.5 4.5l2 2-4.2 4.2" />
      <path d="M14 9.8c-1.5-.3-3 .3-3.7 1.6-.5.9-.4 1.8-1 2.4-.6.6-1.5.5-2.4 1.1-1.2.9-1.4 2.7-.2 3.9 1.2 1.2 3 1 3.9-.2.6-.9.5-1.8 1.1-2.4.6-.6 1.5-.5 2.4-1 1.3-.7 1.9-2.2 1.6-3.7" />
      <circle cx="10.2" cy="13.8" r="1.2" fill="currentColor" stroke="none" />
      <path d="M7.2 16.8l2 2" />
    </svg>
  );
}

export const INSTRUMENT_NAME: Record<Instrument, string> = {
  piano: 'Piano',
  guitar: 'Chitarra',
  ukulele: 'Ukulele',
};

const MONOGRAM_STYLE: Record<Instrument, { bg: string; fg: string; border: string }> = {
  ukulele: {
    bg: 'light-dark(#dde5b6, #313822)',
    fg: 'light-dark(#4e5a2c, #dde5b6)',
    border: 'light-dark(#adc178, #4b5732)',
  },
  guitar: {
    bg: 'light-dark(#f0ead2, #3c2f25)',
    fg: 'light-dark(#6c584c, #e5cbb5)',
    border: 'light-dark(#a98467, #6c584c)',
  },
  piano: {
    bg: 'light-dark(#6c584c, #4a3d34)',
    fg: '#f0ead2',
    border: 'light-dark(#6c584c, #a98467)',
  },
};

export function InstrumentMonogram({
  instrument,
  size = 'md',
}: {
  instrument: Instrument;
  size?: 'sm' | 'md' | 'lg';
}) {
  const palette = MONOGRAM_STYLE[instrument];
  const dims =
    size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-11 h-11 rounded-xl' : 'w-9 h-9 rounded-xl';
  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <div
      className={`${dims} border flex items-center justify-center shrink-0 transition-transform`}
      style={{
        backgroundColor: palette.bg,
        color: palette.fg,
        borderColor: palette.border,
      }}
      title={INSTRUMENT_NAME[instrument]}
    >
      <InstrumentIcon instrument={instrument} className={iconSize} />
    </div>
  );
}

export function TrackCover({
  coverArt,
  title,
  instrument,
  size = 'md',
}: {
  coverArt?: string;
  title: string;
  instrument: Instrument;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (!coverArt) {
    return <InstrumentMonogram instrument={instrument} size={size} />;
  }

  const dims =
    size === 'sm'
      ? 'w-8 h-8 rounded-lg'
      : size === 'lg'
      ? 'w-12 h-12 rounded-xl'
      : 'w-10 h-10 rounded-xl';

  return (
    <img
      src={coverArt}
      alt={`Copertina di ${title}`}
      decoding="async"
      className={`${dims} cover-img object-cover border shrink-0`}
      style={{ borderColor: 'var(--border-color)' }}
    />
  );
}
