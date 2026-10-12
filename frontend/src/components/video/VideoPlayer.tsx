"use client";

import { useState, useRef, useEffect } from "react";
import { Event } from "@/types";

interface VideoPlayerProps {
  cameraId?: string;
  clipUrl?: string | null;
  detectedEvents?: Event[];
  riskLevel?: string;
}

export function VideoPlayer({
  cameraId = "ring-cam-front-door",
  clipUrl = null,
  detectedEvents = [],
  riskLevel = "normal",
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"ai_wireframe" | "video">(
    clipUrl && !clipUrl.includes("sample-") ? "video" : "ai_wireframe"
  );
  const [showAiOverlay, setShowAiOverlay] = useState(true);
  const [currentTimestamp, setCurrentTimestamp] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimestamp(
        now.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }) +
          " " +
          now.toLocaleTimeString("en-US", { hour12: false }) +
          " UTC"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeVideo = customVideoUrl || (clipUrl && !clipUrl.includes("sample-") ? clipUrl : null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setCustomVideoUrl(objectUrl);
      setViewMode("video");
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
      setIsPlaying(!isPlaying);
    }
  };

  const isHighRisk = riskLevel === "high_risk" || riskLevel === "suspicious" || riskLevel === "incident";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-gray-800 shadow-2xl text-white">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Video Viewport */}
      <div className="relative aspect-video w-full flex items-center justify-center bg-zinc-950 overflow-hidden select-none">
        {viewMode === "video" && activeVideo ? (
          <video
            ref={videoRef}
            src={activeVideo}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
            muted
            loop
            controls
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          /* Simulated Ring Camera Porch & Parcel Wireframe Viewport */
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-zinc-900 via-black to-zinc-950">
            {/* Camera subtle grid / scanlines */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />

            {/* Doorstep Porch Mat & Parcel Box */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              {/* Door Frame */}
              <div className="w-32 h-40 border border-zinc-800 rounded-t-lg bg-zinc-900/30 mb-2 flex items-end justify-center p-3">
                {/* Parcel Box */}
                <div
                  className={`w-16 h-14 rounded-xl border-2 flex items-center justify-center shadow-lg transition-all duration-500 ${
                    isHighRisk
                      ? "border-red-500 bg-red-950/40 text-red-400 translate-x-4"
                      : "border-emerald-500 bg-emerald-950/40 text-emerald-400"
                  }`}
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
              </div>

              <span className="text-[11px] font-mono tracking-wider text-zinc-400 uppercase">
                {isHighRisk ? "Zone Alert · Parcel Displaced" : "Active Monitored Zone · Parcel Protected"}
              </span>
            </div>

            {/* AI Bounding Box Overlay */}
            {showAiOverlay && (
              <div
                className={`absolute inset-10 rounded-xl border-2 pointer-events-none transition-all duration-500 flex flex-col justify-between p-3.5 ${
                  isHighRisk
                    ? "border-red-500/80 bg-red-950/10 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-pulse"
                    : "border-emerald-500/50 bg-emerald-950/5"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div
                    className={`text-[10px] font-mono font-bold tracking-widest px-2 py-0.5 rounded uppercase ${
                      isHighRisk ? "bg-red-500 text-black" : "bg-emerald-500 text-black"
                    }`}
                  >
                    AI VISION · {isHighRisk ? "UNAUTHORIZED REMOVAL" : "PARCEL VERIFIED ON DOORSTEP"}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    CONFIDENCE 98.4%
                  </span>
                </div>
                <div className="flex justify-between items-end text-[9px] font-mono text-zinc-400">
                  <span>COORD [124, 88, 512, 390]</span>
                  <span>RING OPTICAL HUD</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Camera HUD */}
        <div className="absolute top-0 inset-x-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-20">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 -ml-4.5" />
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-zinc-200">
              RING · {cameraId}
            </span>
          </div>
          <div className="text-xs font-mono text-zinc-300">
            {currentTimestamp}
          </div>
        </div>

        {/* Bottom Status / Detection HUD */}
        <div className="absolute bottom-0 inset-x-0 p-4 flex justify-between items-end bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20">
          <div className="flex items-center gap-2">
            {/* Load Real Video Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
              title="Upload your own real parcel clip"
            >
              <span>📁</span>
              <span>{customVideoUrl ? "Change Video" : "Load Video"}</span>
            </button>

            {activeVideo && (
              <button
                type="button"
                onClick={() => setViewMode(viewMode === "video" ? "ai_wireframe" : "video")}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md text-xs font-medium transition cursor-pointer"
              >
                {viewMode === "video" ? "Show AI Porch" : "Show Video"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAiOverlay(!showAiOverlay)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                showAiOverlay
                  ? "bg-white text-black border-white"
                  : "bg-white/10 text-white border-white/20 hover:bg-white/20"
              }`}
            >
              {showAiOverlay ? "AI Overlay ON" : "AI Overlay OFF"}
            </button>
          </div>

          {detectedEvents.length > 0 && (
            <div className="text-right">
              <span className="text-[10px] font-mono text-zinc-400 uppercase block">
                Last Activity
              </span>
              <span className="text-xs font-mono font-medium text-white">
                {detectedEvents[0].kind.replace(/_/g, " ")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
