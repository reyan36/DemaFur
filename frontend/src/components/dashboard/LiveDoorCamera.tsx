"use client";

import { useState } from "react";

// Live annotated stream from the edge detector (edge/run.py). Not a secret, so NEXT_PUBLIC is fine.
const EDGE_STREAM_URL = process.env.NEXT_PUBLIC_EDGE_STREAM_URL || null;

/** Always-on front door view: people and packages are detected and tracked by the edge detector. */
export function LiveDoorCamera() {
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (!EDGE_STREAM_URL) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-black tracking-tight text-black">Front door · live</h2>
          <p className="text-xs text-gray-500 font-medium">
            Edge AI tracks people and packages on every frame. No face recognition or identity.
          </p>
        </div>
        <span
          className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
            offline
              ? "text-red-700 bg-red-50 border-red-200"
              : "text-emerald-700 bg-emerald-50 border-emerald-200"
          }`}
        >
          {offline ? "Camera offline" : "● Live"}
        </span>
      </div>

      <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-sm">
        {offline ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
            <p className="text-sm font-mono text-zinc-300">Edge camera not reachable at {EDGE_STREAM_URL}</p>
            <p className="text-xs font-mono text-zinc-500">Start it with: cd edge &amp;&amp; python run.py --loop</p>
            <button
              type="button"
              onClick={() => {
                setOffline(false);
                setAttempt((n) => n + 1);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-white border border-zinc-700"
            >
              Retry
            </button>
          </div>
        ) : (
          // MJPEG streams need a plain <img>; next/image cannot render them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={attempt}
            src={`${EDGE_STREAM_URL}/stream`}
            alt="Live front door camera with AI detections"
            className="w-full h-full object-contain"
            onError={() => setOffline(true)}
          />
        )}
      </div>
    </section>
  );
}
