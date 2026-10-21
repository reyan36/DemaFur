"use client";

interface VideoPlayerProps {
  cameraId?: string;
  clipUrl?: string | null;
}

/** The delivery's recorded clip, or a plain notice when there is none. */
export function VideoPlayer({ cameraId = "front-door", clipUrl = null }: VideoPlayerProps) {
  const clip = clipUrl && !clipUrl.includes("sample-") ? clipUrl : null;

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800">
      {clip ? (
        <video
          src={clip}
          className="w-full h-full object-cover"
          playsInline
          autoPlay
          muted
          loop
          controls
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6">
          <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-zinc-300">No recording attached to this delivery</p>
          <p className="text-xs text-zinc-500">The timeline below lists everything the camera reported.</p>
        </div>
      )}
      <span className="absolute top-3 left-3 text-[11px] font-mono text-white bg-black/60 rounded-md px-2 py-1 pointer-events-none">
        {cameraId}{clip ? " · recorded clip" : ""}
      </span>
    </div>
  );
}
