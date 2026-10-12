"use client";

import { useEffect, useState, useRef } from "react";

interface SurveillanceViewProps {
  scenarioId?: string;
  title?: string;
  riskLevel?: string;
  cameraId?: string;
  videoUrl?: string | null;
}

export function SurveillanceView({
  scenarioId = "porch_pirate_theft",
  title = "Ring Optical Feed",
  riskLevel = "high_risk",
  cameraId = "ring-front-door-cam",
  videoUrl = null,
}: SurveillanceViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"ai_wireframe" | "video">("ai_wireframe");
  const [timestamp, setTimestamp] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimestamp(
        now.toISOString().replace("T", " ").substring(0, 19) + " UTC"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeVideo = customVideoUrl || (videoUrl && !videoUrl.includes("sample-") ? videoUrl : null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setCustomVideoUrl(objectUrl);
      setViewMode("video");
    }
  };

  const isTheft = scenarioId === "porch_pirate_theft" || riskLevel === "incident" || riskLevel === "high_risk";
  const isSuspicious = scenarioId === "suspicious_lingering" || riskLevel === "suspicious" || riskLevel === "needs_confirmation";
  const isPickup = scenarioId === "authorized_pickup";

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-2xl select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* 1. Real Video Feed (if user uploaded footage or provided valid custom URL) */}
      {viewMode === "video" && activeVideo ? (
        <video
          ref={videoRef}
          src={activeVideo}
          autoPlay
          muted
          loop
          playsInline
          controls
          className="w-full h-full object-cover"
        />
      ) : (
        /* 2. High-Tech CCTV Doorstep & Parcel AI Wireframe */
        <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-b from-zinc-900 via-black to-zinc-950 overflow-hidden">
          {/* Subtle Grid / Scanlines */}
          <div className="absolute inset-0 opacity-15 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.8)_100%)] pointer-events-none" />

          {/* Perspective Front Door Porch Wireframe */}
          <div className="relative w-full max-w-md h-48 flex items-center justify-center">
            {/* Door Frame */}
            <div className="absolute w-36 h-48 border-2 border-zinc-800 rounded-t-lg bg-zinc-900/40 backdrop-blur-sm" />
            <div className="absolute w-2 h-2 rounded-full bg-amber-500/70 right-[38%] top-[55%]" />

            {/* Door Mat */}
            <div className="absolute bottom-4 w-44 h-12 border border-zinc-700/60 rounded bg-zinc-800/40" />

            {/* Parcel Box on Doorstep */}
            <div
              className={`absolute bottom-6 w-14 h-12 rounded-lg border-2 flex items-center justify-center shadow-lg transition-all duration-700 ${
                isTheft
                  ? "border-red-500 bg-red-950/40 translate-x-12 opacity-80"
                  : isSuspicious
                  ? "border-amber-500 bg-amber-950/40"
                  : "border-emerald-500 bg-emerald-950/40"
              }`}
            >
              <svg
                className={`w-6 h-6 ${
                  isTheft ? "text-red-400" : isSuspicious ? "text-amber-400" : "text-emerald-400"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>

            {/* Dynamic Intruder / Subject Tracker */}
            {(isTheft || isSuspicious) && (
              <div
                className={`absolute w-28 h-40 border-2 border-dashed rounded-xl flex flex-col justify-between p-2 pointer-events-none animate-pulse ${
                  isTheft
                    ? "right-12 top-4 border-red-500 bg-red-500/10"
                    : "left-14 top-6 border-amber-500 bg-amber-500/10"
                }`}
              >
                <div className="flex justify-between items-center text-[8px] font-mono font-bold">
                  <span className={isTheft ? "bg-red-500 text-black px-1 rounded" : "bg-amber-500 text-black px-1 rounded"}>
                    {isTheft ? "TARGET: FLEEING" : "TARGET: HOVERING"}
                  </span>
                  <span className="text-white">98%</span>
                </div>

                {/* Silhouette Icon */}
                <div className="self-center my-auto opacity-70">
                  <svg
                    className={`w-12 h-12 ${isTheft ? "text-red-400" : "text-amber-400"}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <div className="text-[7px] font-mono text-zinc-300 flex justify-between">
                  <span>{isTheft ? "SPEED 3.8m/s" : "DURATION 95s"}</span>
                  <span>OPTICAL AI</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Camera HUD Overlay */}
      <div className="absolute top-0 inset-x-0 p-3.5 flex justify-between items-center bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none z-20">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          <span className="text-[11px] font-mono font-extrabold uppercase tracking-widest text-white">
            ● REC · {cameraId}
          </span>
          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded">
            1080p HD
          </span>
        </div>
        <div className="text-[11px] font-mono font-semibold text-zinc-300">
          {timestamp}
        </div>
      </div>

      {/* Controls Overlay Bar (Toggle View & Load Real Video) */}
      <div className="absolute bottom-12 right-3 z-30 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-[10px] font-mono text-zinc-200 border border-zinc-700 transition flex items-center gap-1.5 cursor-pointer shadow-md"
          title="Select a real parcel .mp4 video from your computer"
        >
          <span>📁</span>
          <span>{customVideoUrl ? "Change Video" : "Load Real Video"}</span>
        </button>

        {activeVideo && (
          <button
            type="button"
            onClick={() => setViewMode(viewMode === "video" ? "ai_wireframe" : "video")}
            className="px-2.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-[10px] font-mono text-zinc-200 border border-zinc-700 transition cursor-pointer shadow-md"
          >
            {viewMode === "video" ? "Show AI Wireframe" : "Show Video"}
          </button>
        )}
      </div>

      {/* Bottom Live AI Detection Ticker */}
      <div className="absolute bottom-0 inset-x-0 p-3.5 flex justify-between items-end bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 pointer-events-none">
        <div className="space-y-0.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 block">
            Vision Pipeline Status
          </span>
          <span
            className={`text-xs font-mono font-bold uppercase tracking-wider ${
              isTheft
                ? "text-red-400"
                : isSuspicious
                ? "text-amber-400"
                : isPickup
                ? "text-blue-400"
                : "text-emerald-400"
            }`}
          >
            {isTheft
              ? "🚨 UNAUTHORIZED DISPLACEMENT DETECTED"
              : isSuspicious
              ? "⚠️ SUSPICIOUS LINGERING OBSERVED (95s)"
              : isPickup
              ? "✓ TRUSTED WINDOW RETRIEVAL VERIFIED"
              : "✓ PARCEL RESTING SAFELY AT DOORSTEP"}
          </span>
        </div>

        <div className="text-right">
          <span className="text-[9px] font-mono text-zinc-400 block">VIEW MODE</span>
          <span className="text-[10px] font-mono font-bold text-zinc-200">
            {viewMode === "video" && activeVideo ? "OPTICAL STREAM" : "AI PORCH MODEL"}
          </span>
        </div>
      </div>
    </div>
  );
}
