"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmDelivery, createPickupWindow, downloadEvidenceZip } from "@/lib/api";
import { Delivery, EvidenceBundle } from "@/types";

interface DeliveryActionsProps {
  delivery: Delivery;
  evidence: EvidenceBundle | null;
}

export function DeliveryActions({ delivery, evidence: initialEvidence }: DeliveryActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pickup window state
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const handleConfirm = async (outcome: "expected" | "unsure" | "missing") => {
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      await confirmDelivery(delivery.id, outcome);
      setNotice(
        outcome === "expected"
          ? "Package confirmed as collected."
          : outcome === "missing"
          ? "Reported as missing. Incident evidence bundle generated."
          : "Status marked as pending review."
      );
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSchedulePickup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startsAt || !endsAt) {
      setError("Please specify start and end times.");
      return;
    }
    setLoading(true);
    setNotice(null);
    setError(null);
    try {
      await createPickupWindow(
        delivery.id,
        new Date(startsAt).toISOString(),
        new Date(endsAt).toISOString()
      );
      setNotice("Pickup window scheduled successfully.");
      setStartsAt("");
      setEndsAt("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to schedule pickup window");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await downloadEvidenceZip(delivery.id);
      if (!blob) throw new Error("Could not download evidence bundle");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `demafur-evidence-${delivery.id}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  };

  const isCollected = delivery.status === "collected";
  const isIncident = delivery.status === "incident";

  return (
    <div className="space-y-8">
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
          {notice}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Confirmation Decision Controls */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-black tracking-tight mb-2">
          Owner Confirmation Controls
        </h3>
        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
          Autonomous detection suggests risk; your confirmation determines the outcome.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading || isCollected}
            onClick={() => handleConfirm("expected")}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
          >
            ✓ Pickup was expected
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleConfirm("unsure")}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 transition disabled:opacity-50"
          >
            ? I&apos;m not sure
          </button>

          <button
            type="button"
            disabled={loading || isIncident}
            onClick={() => handleConfirm("missing")}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
          >
            🚨 Report package missing
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              if (!confirm("Dismiss this delivery as a false alarm and delete all associated records?")) return;
              setLoading(true);
              try {
                const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://demafur.onrender.com";
                const API_KEY = process.env.NEXT_PUBLIC_DEMAFUR_API_KEY || "demafur_api_k3y_2026_s3cur3";
                await fetch(`${API_URL}/v1/deliveries/${delivery.id}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${API_KEY}` },
                });
                router.push("/dashboard");
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Failed to delete");
                setLoading(false);
              }
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold border border-gray-200 hover:border-red-500 text-gray-500 hover:text-red-600 transition disabled:opacity-50"
          >
            🗑️ Dismiss False Alarm & Delete
          </button>
        </div>
      </div>

      {/* Trusted Pickup Scheduling */}
      {!isCollected && !isIncident && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-black tracking-tight mb-2">
            Schedule a Trusted Pickup Window
          </h3>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            Authorized removals during this window will be classified as legitimate collection, suppressing theft alarms.
          </p>

          <form onSubmit={handleSchedulePickup} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Starts (Local Time)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Ends (Local Time)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-black"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-black text-white hover:bg-zinc-800 transition disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Pickup Window"}
            </button>
          </form>
        </div>
      )}

      {/* Evidence Bundle Section (For Incidents) */}
      {isIncident && (
        <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-red-950 tracking-tight">
                Incident Evidence Package Generated
              </h3>
              <p className="text-xs text-red-700 mt-1">
                Cryptographically hashed audit bundle prepared for insurer or law enforcement review.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleDownloadZip}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition flex items-center justify-center gap-2 self-start sm:self-auto disabled:opacity-50 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Evidence ZIP
            </button>
          </div>

          {initialEvidence && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="bg-white border border-red-100 rounded-xl p-4">
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-red-800 block mb-2">
                  Police Report Draft
                </span>
                <pre className="text-xs font-mono text-zinc-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {initialEvidence.report_draft}
                </pre>
              </div>

              <div className="bg-white border border-red-100 rounded-xl p-4">
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-red-800 block mb-2">
                  Neighbourhood Notice Draft
                </span>
                <pre className="text-xs font-mono text-zinc-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {initialEvidence.neighbours_draft}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
