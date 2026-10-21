"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Play, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { SurveillanceView } from "@/components/video/SurveillanceView";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { apiPost as post, purgeDeliveries } from "@/lib/api";

// One observation in a scenario, sent to the backend when the footage reaches `at` seconds.
interface Cue {
  at: number;
  kind: string;
  label: string;   // shown on the camera overlay when the cue fires
  observations?: Record<string, unknown>;
}

// Demo scenarios. To add footage: put the file in frontend/public/videos/, set videoUrl, and
// time the cues to what happens in the clip. "Play demo footage" picks one with footage at random.
export const CAMERA_SCENARIOS = [
  {
    id: "porch_pirate_theft",
    title: "Porch Pirate Theft",
    description: "Someone steps out of a car, walks up to the porch, takes the parcel and drives off with it.",
    videoUrl: "/videos/package-stolen.mp4",
    pickupWindow: false,
    cues: [
      { at: 0, kind: "package_delivered", label: "Parcel on the porch" },
      { at: 2, kind: "person_approached", label: "Person approaching the parcel", observations: { track_id: 1 } },
      { at: 3.2, kind: "package_touched", label: "Person handling the parcel", observations: { track_id: 1, came_from_door: false } },
      { at: 3.9, kind: "package_removed", label: "Parcel picked up", observations: { track_id: 1 } },
      { at: 6.5, kind: "person_left", label: "Person left with the parcel", observations: { track_id: 1, carried_package: true, came_from_door: false } },
    ] as Cue[],
  },
  {
    id: "handed_to_resident",
    title: "Handed to the Resident",
    description: "A courier brings the parcel to the door and hands it to the resident, who takes it inside.",
    videoUrl: "/videos/package-receive.mp4",
    pickupWindow: false,
    cues: [
      { at: 1.5, kind: "person_approached", label: "Courier approaching the door", observations: { track_id: 1 } },
      { at: 6, kind: "package_delivered", label: "Parcel delivered at the door" },
      { at: 7.5, kind: "package_removed", label: "Resident took the parcel", observations: { track_id: 2 } },
      { at: 9.5, kind: "entered_home", label: "Parcel carried inside", observations: { track_id: 2, carried_package: true, came_from_door: true } },
      { at: 13, kind: "person_left", label: "Courier left", observations: { track_id: 1, carried_package: false, came_from_door: false } },
    ] as Cue[],
  },
  {
    id: "standard_delivery",
    title: "Safe Courier Drop-Off",
    description: "A courier sets the parcels down at the door, rings the bell and leaves.",
    videoUrl: "/videos/package-dropoff.mp4",
    pickupWindow: false,
    cues: [
      { at: 1.5, kind: "person_approached", label: "Courier approaching the door", observations: { track_id: 1 } },
      { at: 4.5, kind: "package_delivered", label: "Parcel left at the door" },
      { at: 5.8, kind: "doorbell", label: "Doorbell pressed" },
      { at: 8.5, kind: "person_left", label: "Courier left", observations: { track_id: 1, carried_package: false, came_from_door: false } },
    ] as Cue[],
  },
];

type Scenario = (typeof CAMERA_SCENARIOS)[number];

interface CameraControlsProps {
  ringConnected?: boolean;
  ringSandbox?: boolean;
  onEventCreated?: () => void;
  onClearAll?: () => void;
}

// Demo runs pick from the scenarios that have footage; the others are used only if none do.
const DEMO_POOL = CAMERA_SCENARIOS.some((s) => s.videoUrl)
  ? CAMERA_SCENARIOS.filter((s) => s.videoUrl)
  : CAMERA_SCENARIOS;

const RING_PORTAL_URL = "https://demafur.onrender.com/review";

export function CameraControls({ ringConnected = false, ringSandbox = false, onEventCreated, onClearAll }: CameraControlsProps) {
  const router = useRouter();
  const [simulating, setSimulating] = useState(false);
  const [showRingModal, setShowRingModal] = useState(false);
  const [run, setRun] = useState<{ scenario: Scenario; parcelId: string; id: number } | null>(null);
  const [detection, setDetection] = useState<{ label: string; level: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetProgress, setResetProgress] = useState<number | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const runId = useRef(0);                              // bumps on every new run or dismiss
  const sentCues = useRef<Set<number>>(new Set());
  const outbox = useRef<Promise<void>>(Promise.resolve());   // keeps events in order
  const lastScenarioId = useRef<string | null>(null);
  const activeScenario = run?.scenario ?? null;

  // Play a random demo clip (not the same one twice in a row). Its events are sent as the
  // footage reaches each cue, so the dashboard's risk changes while it plays.
  const handleSimulateCamera = () => {
    const choices = DEMO_POOL.length > 1
      ? DEMO_POOL.filter((s) => s.id !== lastScenarioId.current)
      : DEMO_POOL;
    const scenario = choices[Math.floor(Math.random() * choices.length)];
    lastScenarioId.current = scenario.id;
    runId.current += 1;
    sentCues.current = new Set();
    setRun({
      scenario,
      parcelId: `pkg-${scenario.id.slice(0, 5)}-${Math.random().toString(36).substring(2, 7)}`,
      id: runId.current,
    });
    setDetection(null);
    setNotice(null);
    setError(null);
    setSimulating(true);
  };

  const stopSimulation = () => {
    runId.current += 1;        // ignore replies still in flight
    setRun(null);
    setSimulating(false);
  };

  const sendCue = (index: number) => {
    if (!run || sentCues.current.has(index)) return;
    sentCues.current.add(index);
    const { scenario, parcelId, id } = run;
    const cue = scenario.cues[index];
    outbox.current = outbox.current.then(async () => {
      if (runId.current !== id) return;
      try {
        // The parcel is already on the porch when the clip starts, so date it a little earlier.
        const occurredAt = cue.kind === "package_delivered" && cue.at === 0
          ? new Date(Date.now() - 120000) : new Date();
        // With the Ring sandbox on, a doorbell press arrives the way Ring sends it: as a signed
        // webhook through the backend's Ring handler.
        if (ringSandbox && cue.kind === "doorbell") {
          const ring = await post("/v1/integrations/ring/sandbox/events", { delivery_id: parcelId, kind: "button_press" });
          if (!ring.ok) throw new Error(`Ring sandbox rejected the doorbell (${ring.status})`);
          if (runId.current !== id) return;
          setDetection((prev) => ({ label: `${cue.label} · via Ring`, level: prev?.level ?? "normal" }));
          onEventCreated?.();
          if (index === scenario.cues.length - 1) setSimulating(false);
          return;
        }
        const res = await post("/v1/events", {
          event_id: `${parcelId}-${index}-${cue.kind}`,
          delivery_id: parcelId,
          camera_id: "ring-front-door-cam",
          kind: cue.kind,
          occurred_at: occurredAt.toISOString(),
          confidence: 0.95,
          media_ref: scenario.videoUrl,
          observations: cue.observations ?? {},
        });
        if (!res.ok) throw new Error(`Backend rejected ${cue.kind} (${res.status})`);
        const level = (await res.json()).delivery?.risk?.level ?? "normal";
        // A pickup window must exist before the removal for the backend to trust it.
        if (scenario.pickupWindow && cue.kind === "package_delivered") {
          await post("/v1/pickup-windows", {
            delivery_id: parcelId,
            starts_at: new Date(Date.now() - 60000).toISOString(),
            ends_at: new Date(Date.now() + 1800000).toISOString(),
          });
        }
        if (runId.current !== id) return;
        setDetection({ label: cue.label, level });
        onEventCreated?.();
        if (index === scenario.cues.length - 1) {
          setNotice(`${scenario.title}: recorded as ${parcelId.toUpperCase()}.`);
          setSimulating(false);
          router.refresh();
        }
      } catch (err: unknown) {
        if (runId.current !== id) return;
        setError(err instanceof Error ? err.message : "Simulation request failed");
        setSimulating(false);
      }
    });
  };

  // Called with the footage position (seconds); sends every cue the footage has reached.
  const onFootageTime = (seconds: number) => {
    run?.scenario.cues.forEach((cue, index) => {
      if (seconds >= cue.at) sendCue(index);
    });
  };

  // Scenarios without footage play their cues on a clock instead.
  useEffect(() => {
    if (!run || run.scenario.videoUrl) return;
    const started = Date.now();
    const timer = setInterval(() => onFootageTime((Date.now() - started) / 1000), 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const handleReset = async () => {
    setResetError(null);
    setResetProgress(0);
    try {
      const count = await purgeDeliveries(setResetProgress);
      stopSimulation();
      setResetOpen(false);
      setNotice(`Reset complete: ${count} ${count === 1 ? "delivery" : "deliveries"} removed.`);
      onClearAll?.();
      router.refresh();
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex justify-between items-center gap-3">
          <span>
            {notice}{" "}
            {run && !simulating && (
              <Link href={`/packages/${run.parcelId}`} className="font-semibold underline underline-offset-2">
                View report
              </Link>
            )}
          </span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-emerald-600 hover:text-emerald-900 font-bold">×</button>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex justify-between items-center gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-600 hover:text-red-900 font-bold">×</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={simulating}
          onClick={handleSimulateCamera}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-black text-white hover:bg-zinc-800 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <Play className="w-4 h-4" fill="currentColor" />
          {simulating ? "Playing demo…" : "Play demo footage"}
        </button>

        <button
          type="button"
          onClick={() => setShowRingModal(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-black border border-gray-200 hover:border-black transition flex items-center gap-2 cursor-pointer"
        >
          <span className="relative">
            <Camera className="w-4 h-4" />
            <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${ringConnected ? "bg-emerald-500" : "bg-gray-300"}`} />
          </span>
          {ringSandbox ? "Ring sandbox connected" : ringConnected ? "Ring camera connected" : "Connect Ring camera"}
        </button>

        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="ml-auto px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 transition inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset data
        </button>
      </div>

      {activeScenario && (
        <div className="bg-zinc-900 text-white rounded-2xl p-5 border border-zinc-800 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 block mb-1">
                Demo · {activeScenario.videoUrl ? "recorded footage" : "simulated observations"}
              </span>
              <h3 className="text-base font-bold text-white tracking-tight">{activeScenario.title}</h3>
              <p className="text-sm text-zinc-400 mt-0.5">{activeScenario.description}</p>
            </div>
            <button onClick={stopSimulation} className="text-xs font-mono text-zinc-400 hover:text-white">
              Close
            </button>
          </div>

          <SurveillanceView
            key={run?.id}
            cameraId="ring-front-door-cam"
            videoUrl={activeScenario.videoUrl}
            onTime={onFootageTime}
            detection={detection}
          />
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        title="Reset all data?"
        message="Every delivery, event and report will be deleted. This cannot be undone."
        confirmLabel="Delete everything"
        danger
        busy={resetProgress !== null}
        progress={resetProgress}
        error={resetError}
        onConfirm={handleReset}
        onCancel={() => setResetOpen(false)}
      />

      {showRingModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowRingModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-white rounded-2xl p-6 space-y-5 shadow-2xl border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-black">
                {ringConnected ? "Ring camera connected" : "Connect your Ring camera"}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Link your Ring account through Amazon&apos;s authorization page, then choose the
                camera that watches your door. Its motion and doorbell events then appear here
                automatically.
              </p>
            </div>
            <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
              <li>Open the Ring portal and sign in with your household key.</li>
              <li>Approve DemaFur in your Ring account.</li>
              <li>Load your cameras and start watching a delivery.</li>
            </ol>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRingModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"
              >
                Close
              </button>
              <a
                href={RING_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl text-sm font-bold bg-black hover:bg-zinc-800 text-white transition"
              >
                Open Ring portal ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
