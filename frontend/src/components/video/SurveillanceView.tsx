"use client";

import { useEffect, useRef, useState } from "react";
import { VideoOff } from "lucide-react";
import { label, RISK_LABELS } from "@/lib/labels";

const EDGE_STREAM_URL = process.env.NEXT_PUBLIC_EDGE_STREAM_URL?.replace(/\/+$/, "") || null;

interface SurveillanceViewProps {
  cameraId?: string;
  videoUrl?: string | null;
  onTime?: (seconds: number) => void;                        // footage position while it plays
  detection?: { label: string; level: string } | null;       // latest observation and backend risk
}

const LEVEL_TONES: Record<string, string> = {
  high_risk: "text-red-400",
  suspicious: "text-orange-400",
  needs_confirmation: "text-amber-400",
  normal: "text-emerald-400",
};

/** Demo camera view: the scenario footage with what was just observed and the backend's verdict. */
export function SurveillanceView({
  cameraId = "ring-front-door-cam",
  videoUrl = null,
  onTime,
  detection = null,
}: SurveillanceViewProps) {
  const lastTime = useRef(0);
  const [live, setLive] = useState(false);       // show the edge detector's stream instead
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC");
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // Report the footage position. When the looping clip jumps back to the start, report its
  // end first so a cue in the last fraction of a second is never missed.
  const handleTimeUpdate = (seconds: number) => {
    if (seconds < lastTime.current - 1) onTime?.(Infinity);
    lastTime.current = seconds;
    onTime?.(seconds);
  };

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 select-none">
      {live && EDGE_STREAM_URL ? (
        // MJPEG streams need a plain <img>; next/image cannot render them.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${EDGE_STREAM_URL}/stream`} alt="Live AI camera" className="w-full h-full object-contain bg-black" />
      ) : videoUrl ? (
        <video
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          onTimeUpdate={(e) => handleTimeUpdate(e.currentTarget.currentTime)}
          onEnded={() => onTime?.(Infinity)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
          <VideoOff className="w-8 h-8" strokeWidth={1.5} />
          <span className="text-sm">No footage for this scenario</span>
        </div>
      )}

      {/* Camera name and clock */}
      <div className="absolute top-0 inset-x-0 p-3.5 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <span className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-wider text-white">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {cameraId}
        </span>
        <span className="text-[11px] font-mono text-zinc-300">{clock}</span>
      </div>

      {EDGE_STREAM_URL && !live && (
        <button
          type="button"
          onClick={() => setLive(true)}
          className="absolute top-12 right-3 px-2.5 py-1 rounded-lg bg-red-600/90 hover:bg-red-500 text-[10px] font-mono text-white transition"
        >
          Live AI camera
        </button>
      )}

      {/* What was just observed, coloured by the backend's risk verdict */}
      <div className="absolute bottom-0 inset-x-0 p-3.5 bg-gradient-to-t from-black/85 to-transparent pointer-events-none">
        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 block">Latest observation</span>
        <span className={`text-xs font-mono font-bold uppercase tracking-wider ${
          detection ? LEVEL_TONES[detection.level] ?? "text-zinc-200" : "text-zinc-300"}`}>
          {detection
            ? `${detection.label} · ${label(RISK_LABELS, detection.level)}`
            : "Watching the doorstep…"}
        </span>
      </div>
    </div>
  );
}
