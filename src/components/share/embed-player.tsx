'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/** Minimal, chromeless player used inside <iframe> embeds. */
export function EmbedPlayer({
  token,
  name,
  mimeType,
  hasThumbnail,
  fileId,
}: {
  token: string;
  name: string;
  mimeType: string;
  hasThumbnail: boolean;
  fileId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);

  const applySpeed = (value: number) => {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  };

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-slate-950 p-6 text-center text-sm text-slate-400">
        <p>This video could not be played in your browser.</p>
        <a href={`/share/${token}`} target="_blank" rel="noreferrer" className="text-xs text-sky-400 underline">
          Open the video page
        </a>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen bg-black">
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={hasThumbnail ? `/api/files/${fileId}/thumbnail` : undefined}
        className="h-full w-full object-contain"
        onError={() => setError(true)}
      >
        <source src={`/media/${token}/${encodeURIComponent(name)}`} type={mimeType} />
      </video>
      <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg bg-black/60 p-1 opacity-0 backdrop-blur transition hover:opacity-100 focus-within:opacity-100">
        {[1, 1.5, 2].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => applySpeed(value)}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold transition',
              speed === value ? 'bg-white text-slate-900' : 'text-white/80 hover:bg-white/10',
            )}
            aria-label={`Playback speed ${value}x`}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  );
}
