"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileJson, FileText, Film, ShieldCheck } from "lucide-react";
import { confirmDelivery, createPickupWindow, deleteDelivery, downloadEvidenceZip } from "@/lib/api";
import { Delivery, EvidenceBundle } from "@/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DeliveryActionsProps {
  delivery: Delivery;
  evidence: EvidenceBundle | null;
}

export function DeliveryActions({ delivery, evidence: initialEvidence }: DeliveryActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          ? "Marked as collected."
          : outcome === "missing"
          ? "Reported missing. An evidence bundle has been prepared below."
          : "Kept open for review."
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
      setNotice("Pickup window saved.");
      setStartsAt("");
      setEndsAt("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to schedule pickup window");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setDeleteError(null);
    try {
      await deleteDelivery(delivery.id);
      router.push("/dashboard");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
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
  const footage = [...new Set((initialEvidence?.media ?? []).map((m) => m.media_ref))];

  return (
    <div className="space-y-6">
      {notice && (
        <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          {notice}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Owner decision */}
      <section className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-black">Your decision</h2>
          <p className="text-sm text-gray-500 mt-1">
            The camera flags risk; you decide what actually happened.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={loading || isCollected}
            onClick={() => handleConfirm("expected")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-black hover:bg-zinc-800 text-white transition disabled:opacity-40"
          >
            Pickup was expected
          </button>
          <button
            type="button"
            disabled={loading || isIncident}
            onClick={() => handleConfirm("missing")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-40"
          >
            Report parcel missing
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1 text-sm">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleConfirm("unsure")}
            className="text-gray-600 hover:text-black transition disabled:opacity-40"
          >
            I&apos;m not sure yet
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            className="text-gray-400 hover:text-red-600 transition disabled:opacity-40"
          >
            Delete as false alarm
          </button>
        </div>
      </section>

      {/* Trusted Pickup Scheduling */}
      {!isCollected && !isIncident && (
        <section className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-black">Expecting someone to collect it?</h2>
            <p className="text-sm text-gray-500 mt-1">
              Removals inside this window count as a normal pickup and raise no alarm.
            </p>
          </div>

          <form onSubmit={handleSchedulePickup} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-gray-600">
                From
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="mt-1 w-full text-sm p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-black"
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Until
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="mt-1 w-full text-sm p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-black"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 hover:border-black text-black transition disabled:opacity-40"
            >
              {loading ? "Saving…" : "Save pickup window"}
            </button>
          </form>
        </section>
      )}

      {/* Evidence Bundle Section (For Incidents) */}
      {isIncident && (
        <section className="bg-white border border-red-100 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-black">Evidence bundle</h2>
              <p className="text-sm text-gray-500 mt-1">
                Timeline, report drafts and recordings, for your insurer or the police. Review before sending.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleDownloadZip}
              className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold bg-black hover:bg-zinc-800 text-white transition disabled:opacity-40"
            >
              Download ZIP
            </button>
          </div>

          {initialEvidence && (
            <div className="space-y-3">
              {/* What the ZIP will contain, so the owner can check it before sending it anywhere */}
              <ul className="rounded-xl border border-gray-100 divide-y divide-gray-50 text-sm">
                <li className="flex items-center gap-3 px-4 py-2.5">
                  <FileJson className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 text-gray-700">evidence.json</span>
                  <span className="text-xs text-gray-400">{initialEvidence.timeline?.length ?? 0} events</span>
                </li>
                <li className="flex items-center gap-3 px-4 py-2.5">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 text-gray-700">report-draft.txt · neighbours-draft.txt</span>
                  <span className="text-xs text-gray-400">drafts</span>
                </li>
                <li className="flex items-center gap-3 px-4 py-2.5">
                  <ShieldCheck className="w-4 h-4 text-gray-400" />
                  <span className="flex-1 text-gray-700">sha256-manifest.json</span>
                  <span className="text-xs text-gray-400">SHA-256 of every file</span>
                </li>
              </ul>

              {footage.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <Film className="w-3.5 h-3.5" /> Footage referenced by the events
                  </p>
                  {footage.map((ref) =>
                    ref.startsWith("/") ? (
                      <video key={ref} src={ref} muted loop playsInline controls className="w-full rounded-xl bg-black aspect-video" />
                    ) : (
                      <p key={ref} className="text-xs font-mono text-gray-500 break-all">{ref}</p>
                    )
                  )}
                  <p className="text-[11px] text-gray-400">
                    Referenced footage is listed in the bundle but not copied into it; Ring clips are included when downloaded.
                  </p>
                </div>
              )}

              <details className="rounded-xl border border-gray-100 p-4" open>
                <summary className="text-xs font-semibold text-gray-700 cursor-pointer">Police report draft</summary>
                <pre className="mt-2 text-xs font-mono text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {initialEvidence.report_draft}
                </pre>
              </details>
              <details className="rounded-xl border border-gray-100 p-4">
                <summary className="text-xs font-semibold text-gray-700 cursor-pointer">Neighbourhood notice draft</summary>
                <pre className="mt-2 text-xs font-mono text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {initialEvidence.neighbours_draft}
                </pre>
              </details>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this delivery?"
        message="Use this for false alarms. Its events, actions and evidence will be removed."
        confirmLabel="Delete"
        danger
        busy={loading}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
