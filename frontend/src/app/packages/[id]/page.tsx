import Link from "next/link";
import { getDelivery, getEvidence } from "@/lib/api";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { DeliveryActions } from "@/components/packages/DeliveryActions";
import { EdgeInsights } from "@/components/packages/EdgeInsights";
import { LiveDoorCamera } from "@/components/dashboard/LiveDoorCamera";
import { Activity, ArrowLeft } from "lucide-react";
import { EVENT_ICONS, EVENT_LABELS, RISK_BADGES, RISK_LABELS, STATUS_LABELS, label } from "@/lib/labels";

// Verdict banner colours by risk level.
const VERDICT_STYLES: Record<string, string> = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-900",
  needs_confirmation: "border-amber-200 bg-amber-50 text-amber-900",
  suspicious: "border-orange-200 bg-orange-50 text-orange-900",
  high_risk: "border-red-200 bg-red-50 text-red-900",
};

function offset(from: string, to: string) {
  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  return `+${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default async function PackageDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const delivery = await getDelivery(id);

  if (!delivery) {
    return (
      <div className="max-w-3xl mx-auto p-6 sm:p-8 space-y-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center space-y-2">
          <h1 className="text-lg font-bold text-black">Delivery not found</h1>
          <p className="text-sm text-gray-500">
            {id.toUpperCase()} may have been deleted, or the server is still starting. Try again in a moment.
          </p>
        </div>
      </div>
    );
  }

  const evidence = delivery.status === "incident" ? await getEvidence(id) : null;
  const isEdge = delivery.id.startsWith("edge-");
  const clipUrl = delivery.timeline.find((e) => e.media_ref)?.media_ref || null;
  const level = delivery.risk?.level ?? "normal";
  const firstAt = delivery.timeline[0]?.occurred_at;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-black font-mono">
              {delivery.id.toUpperCase()}
            </h1>
            <p className="text-sm text-gray-500">
              {delivery.camera_id} · first seen {new Date(delivery.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-gray-50 text-gray-700 border-gray-200">
              {label(STATUS_LABELS, delivery.status)}
            </span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${RISK_BADGES[level] ?? ""}`}>
              {label(RISK_LABELS, level)}
            </span>
          </div>
        </div>
      </div>

      {/* Verdict: the risk level and why, in one place */}
      {delivery.risk && (
        <section className={`rounded-2xl border px-5 py-4 ${VERDICT_STYLES[level] ?? "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold">{label(RISK_LABELS, level)}</h2>
            <span className="text-[11px] font-mono opacity-70">
              score {delivery.risk.score}/100 · heuristic, not a probability
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed">
            {delivery.risk.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: footage and what the camera reported */}
        <div className="lg:col-span-7 space-y-6">
          {isEdge ? <LiveDoorCamera /> : <VideoPlayer cameraId={delivery.camera_id} clipUrl={clipUrl} />}

          <section className="bg-white border border-gray-100 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-black mb-4">Timeline</h2>
            {delivery.timeline.length === 0 ? (
              <p className="text-sm text-gray-400">No events recorded yet.</p>
            ) : (
              <ol className="space-y-4">
                {delivery.timeline.map((evt, idx) => {
                  const obs = evt.observations ?? {};
                  const alarming = obs.carried_package === true || evt.kind === "package_removed";
                  const Icon = EVENT_ICONS[evt.kind] ?? Activity;
                  return (
                    <li key={evt.event_id || idx} className="flex gap-3">
                      <span className="w-12 shrink-0 text-xs font-mono text-gray-400 pt-1.5">
                        {firstAt ? offset(firstAt, evt.occurred_at) : ""}
                      </span>
                      <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${
                        alarming ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-black">
                          {label(EVENT_LABELS, evt.kind)}
                          {obs.carried_package === true && <span className="text-red-600"> with the parcel</span>}
                          {obs.came_from_door === true && <span className="text-gray-500"> from the house</span>}
                          {evt.provenance === "ring_webhook" && (
                            <span className="ml-2 align-middle text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                              via Ring
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] font-mono text-gray-400">
                          {new Date(evt.occurred_at).toLocaleTimeString()}
                          {obs.track_id != null && ` · person #${String(obs.track_id)}`}
                          {` · ${Math.round(evt.confidence * 100)}% confidence`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Right: the report, automatic responses and the owner's decision */}
        <div className="lg:col-span-5 space-y-6">
          <EdgeInsights deliveryId={delivery.id} />
          <DeliveryActions delivery={delivery} evidence={evidence} />
        </div>
      </div>
    </div>
  );
}
