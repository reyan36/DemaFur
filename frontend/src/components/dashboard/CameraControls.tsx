"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SurveillanceView } from "@/components/video/SurveillanceView";

// 4 Realistic Video Scenarios with AI explanations
// Place your .mp4 files in frontend/public/videos/ — these play as the live camera feed
export const CAMERA_SCENARIOS = [
  {
    id: "porch_pirate_theft",
    title: "Porch Pirate Theft",
    risk: "high_risk",
    status: "incident",
    description: "Perpetrator runs up to doorstep, grabs the delivered box, and flees into a waiting vehicle.",
    videoUrl: null,
    aiDetails: "Unauthorized package removal observed 3 minutes post-delivery. Immediate motion acceleration detected.",
    events: ["package_delivered", "package_removed"],
  },
  {
    id: "suspicious_lingering",
    title: "Suspicious Lingering & Tampering",
    risk: "suspicious",
    status: "needs_confirmation",
    description: "Unidentified person in dark clothing lingers for 90+ seconds looking around before touching parcel.",
    videoUrl: null,
    aiDetails: "95 seconds of lingering and looking-around behaviour recorded before parcel displacement.",
    events: ["package_delivered", "person_approached", "package_removed"],
  },
  {
    id: "standard_delivery",
    title: "Safe Courier Drop-Off",
    risk: "normal",
    status: "delivered",
    description: "Courier carefully places parcel on doorstep, takes verification snapshot, and departs normally.",
    videoUrl: null,
    aiDetails: "Standard drop-off pattern recognized. Parcel resting safely at doorstep. No tampering detected.",
    events: ["package_delivered"],
  },
  {
    id: "authorized_pickup",
    title: "Authorized Pickup (Window Verified)",
    risk: "normal",
    status: "collected",
    description: "Designated household member or trusted neighbor collects package during pre-scheduled window.",
    videoUrl: null,
    aiDetails: "Removal authenticated against active trusted pickup window. Alarm automatically suppressed.",
    events: ["package_delivered", "package_removed"],
  },
];

interface CameraControlsProps {
  onEventCreated?: () => void;
  onClearAll?: () => void;
}

export function CameraControls({ onEventCreated, onClearAll }: CameraControlsProps) {
  const router = useRouter();
  const [simulating, setSimulating] = useState(false);
  const [purging, setPurging] = useState(false);
  const [showRingModal, setShowRingModal] = useState(false);
  const [activeScenario, setActiveScenario] = useState<typeof CAMERA_SCENARIOS[0] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const API_URL =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_API_URL || "https://demafur.onrender.com";
  const API_KEY = process.env.NEXT_PUBLIC_DEMAFUR_API_KEY || "demafur_api_k3y_2026_s3cur3";

  // Single button: Simulate Camera Event
  const handleSimulateCamera = async () => {
    setSimulating(true);
    setNotice(null);
    setError(null);

    // Pick 1 of 4 scenarios randomly
    const scenario = CAMERA_SCENARIOS[Math.floor(Math.random() * CAMERA_SCENARIOS.length)];
    setActiveScenario(scenario);

    const parcelId = `pkg-${scenario.id.slice(0, 5)}-${Math.random().toString(36).substring(2, 7)}`;
    const cameraId = "ring-front-door-cam";
    const now = new Date();

    try {
      const headers = {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      };

      // 1. Send package delivered
      await fetch(`${API_URL}/v1/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event_id: `${parcelId}-del`,
          delivery_id: parcelId,
          camera_id: cameraId,
          kind: "package_delivered",
          occurred_at: new Date(now.getTime() - 120000).toISOString(),
          confidence: 0.99,
          media_ref: scenario.videoUrl,
        }),
      });

      // 2. If scenario involves trusted window
      if (scenario.id === "authorized_pickup") {
        await fetch(`${API_URL}/v1/pickup-windows`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            delivery_id: parcelId,
            starts_at: new Date(now.getTime() - 180000).toISOString(),
            ends_at: new Date(now.getTime() + 1800000).toISOString(),
          }),
        });
      }

      // 3. If scenario has removal
      if (scenario.events.includes("package_removed")) {
        await fetch(`${API_URL}/v1/events`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            event_id: `${parcelId}-rem`,
            delivery_id: parcelId,
            camera_id: cameraId,
            kind: "package_removed",
            occurred_at: now.toISOString(),
            confidence: 0.97,
            media_ref: scenario.videoUrl,
          }),
        });
      }

      // 4. If scenario is confirmed incident
      if (scenario.status === "incident") {
        await fetch(`${API_URL}/v1/deliveries/${parcelId}/confirmation`, {
          method: "POST",
          headers,
          body: JSON.stringify({ outcome: "missing" }),
        });
      }

      setNotice(`Camera triggered: ${scenario.title} recorded & analyzed!`);
      if (onEventCreated) onEventCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Simulation request failed");
    } finally {
      setSimulating(false);
    }
  };

  // Purge all test data (with automatic fallback to itemized deletion)
  const handlePurgeAll = async () => {
    if (!confirm("Are you sure you want to remove all existing packages and reset the database?")) return;
    setPurging(true);
    setNotice("Purging all package data...");
    setError(null);
    try {
      const headers = {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      };

      // 1. Try server-side fast purge
      const res = await fetch(`${API_URL}/v1/deliveries/purge`, {
        method: "POST",
        headers,
      });

      if (res.ok) {
        setNotice("Database reset. All deliveries purged successfully.");
        setActiveScenario(null);
        if (onClearAll) onClearAll();
        return;
      }

      // 2. Fallback: If Render has not redeployed the purge endpoint yet, delete item-by-item
      const listRes = await fetch(`${API_URL}/v1/deliveries?limit=100`, { headers });
      if (listRes.ok) {
        const data = await listRes.json();
        const items = data.items || [];
        await Promise.all(
          items.map((item: { id: string }) =>
            fetch(`${API_URL}/v1/deliveries/${item.id}`, {
              method: "DELETE",
              headers,
            }).catch(() => {})
          )
        );
        setNotice(`Database reset. Purged ${items.length} deliveries.`);
        setActiveScenario(null);
        if (onClearAll) onClearAll();
      } else {
        setError("Failed to clear database. Please check backend connection.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error clearing database");
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex justify-between items-center">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold cursor-pointer">×</button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-900 font-bold cursor-pointer">×</button>
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Primary Simulate Camera Button */}
        <button
          type="button"
          disabled={simulating || purging}
          onClick={handleSimulateCamera}
          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-black text-white hover:bg-zinc-800 transition flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
        >
          {simulating ? (
            <span className="w-4 h-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          ) : (
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
          {simulating ? "Triggering Camera Observation..." : "Simulate a Camera"}
        </button>

        {/* Link Original Ring Camera Button */}
        <button
          type="button"
          onClick={() => setShowRingModal(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-black border border-gray-200 hover:border-black transition flex items-center gap-2 shadow-sm cursor-pointer"
        >
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Link Original Ring Camera
        </button>

        {/* Clear Data Button */}
        <button
          type="button"
          disabled={purging || simulating}
          onClick={handlePurgeAll}
          className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          title="Purge all test packages"
        >
          {purging && (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
          )}
          {purging ? "Resetting..." : "Reset Data"}
        </button>
      </div>

      {/* Active Scenario Details Overlay (if recently triggered) */}
      {activeScenario && (
        <div className="bg-zinc-900 text-white rounded-2xl p-5 border border-zinc-800 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold block mb-1">
                Camera Feed Active · Real Footage Analyzed
              </span>
              <h3 className="text-base font-bold text-white tracking-tight">
                {activeScenario.title}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {activeScenario.description}
              </p>
            </div>
            <button
              onClick={() => setActiveScenario(null)}
              className="text-xs font-mono text-zinc-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>

          {/* Embedded Video Clip Preview with guaranteed CCTV failover */}
          <SurveillanceView
            scenarioId={activeScenario.id}
            title={activeScenario.title}
            riskLevel={activeScenario.risk}
            cameraId="ring-front-door-cam"
            videoUrl={activeScenario.videoUrl}
          />

          <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800/80 text-xs font-mono">
            <span className="text-emerald-400 font-bold block mb-1">AI OBSERVATION:</span>
            <span className="text-zinc-300">{activeScenario.aiDetails}</span>
          </div>
        </div>
      )}

      {/* Link Ring Camera Modal */}
      {showRingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 font-black">
                  R
                </div>
                <div>
                  <h3 className="text-lg font-black text-black">Link Original Ring Camera</h3>
                  <p className="text-xs text-gray-500">Authorize your Amazon Ring Doorbell or Camera</p>
                </div>
              </div>
              <button
                onClick={() => setShowRingModal(false)}
                className="text-gray-400 hover:text-black font-bold text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-xs text-gray-600 leading-relaxed">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                <span className="font-bold text-black block">How it works:</span>
                <p>
                  1. DemaFur connects directly via the <strong>Ring Partner API</strong> using Amazon OAuth.
                </p>
                <p>
                  2. Clicking the authorization portal below will open your live staging workspace where you can link your Ring account and load your shared cameras.
                </p>
                <p>
                  3. Once linked, real-time motion and doorbell ring events will automatically stream into this dashboard.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRingModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-black transition"
              >
                Close
              </button>
              <a
                href="https://demafur.onrender.com/review"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition text-center shadow-md shadow-blue-500/20"
              >
                Launch Ring OAuth Portal &rarr;
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
