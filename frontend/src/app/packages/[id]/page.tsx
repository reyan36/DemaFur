import Link from "next/link";
import { notFound } from "next/navigation";
import { getDelivery, getEvidence } from "@/lib/api";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { DeliveryActions } from "@/components/packages/DeliveryActions";
import { EdgeInsights } from "@/components/packages/EdgeInsights";
import { LiveDoorCamera } from "@/components/dashboard/LiveDoorCamera";

export default async function PackageDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const delivery = await getDelivery(id);

  if (!delivery) {
    return (
      <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-6">
        <Link
          href="/dashboard"
          className="text-xs font-semibold tracking-wider uppercase text-gray-500 hover:text-black transition"
        >
          &larr; Back to Dashboard
        </Link>
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center space-y-3">
          <h2 className="text-xl font-bold text-black">Delivery Not Found</h2>
          <p className="text-sm text-gray-500 font-mono">
            Could not find delivery with reference: {id}
          </p>
        </div>
      </div>
    );
  }

  const evidence = delivery.status === "incident" ? await getEvidence(id) : null;
  const isEdge = delivery.id.startsWith("edge-");

  const statusStyles: Record<string, string> = {
    awaiting_delivery: "bg-blue-50 text-blue-700 border-blue-200",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    needs_confirmation: "bg-amber-50 text-amber-700 border-amber-200",
    collected: "bg-purple-50 text-purple-700 border-purple-200",
    incident: "bg-red-50 text-red-700 border-red-200",
  };

  const riskStyles: Record<string, string> = {
    normal: "border-emerald-100 bg-emerald-50/50 text-emerald-900",
    needs_confirmation: "border-blue-100 bg-blue-50/50 text-blue-900",
    suspicious: "border-amber-100 bg-amber-50/50 text-amber-900",
    high_risk: "border-red-100 bg-red-50/50 text-red-900",
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-10">
      {/* Top Navigation & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-400 hover:text-black transition inline-block mb-1"
          >
            &larr; Back to Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-black font-mono">
              {delivery.id.toUpperCase()}
            </h1>
            <span
              className={`text-[10px] font-mono font-bold tracking-widest uppercase px-3 py-1 rounded-full border ${
                statusStyles[delivery.status] || "bg-gray-50 text-gray-700 border-gray-200"
              }`}
            >
              {delivery.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        <div className="text-xs text-gray-500 font-mono">
          <span>Camera: </span>
          <strong className="text-black">{delivery.camera_id}</strong>
          <span className="mx-2">·</span>
          <span>Logged: {new Date(delivery.created_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Main Grid: Video Player on Left, Risk & Info on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column: Video Feed & Timeline */}
        <div className="lg:col-span-7 space-y-8">
          {isEdge ? (
            /* Deliveries from the edge detector: show the real annotated camera feed */
            <LiveDoorCamera />
          ) : (
          <div>
            <h2 className="text-sm font-bold tracking-tight text-black mb-3">
              Ring Optical Monitoring & Evidence Feed
            </h2>
            {(() => {
              const clipEvent = delivery.timeline.find((e) => e.media_ref);
              const clipUrl = clipEvent?.media_ref || null;
              return (
                <VideoPlayer
                  cameraId={delivery.camera_id}
                  clipUrl={clipUrl}
                  detectedEvents={delivery.timeline}
                  riskLevel={delivery.risk?.level}
                />
              );
            })()}
          </div>
          )}

          {/* Observed Events Timeline */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-black tracking-tight mb-4">
              Observed Chronological Timeline
            </h3>

            {delivery.timeline.length === 0 ? (
              <p className="text-xs text-gray-400 font-mono">No events recorded yet.</p>
            ) : (
              <ol className="relative border-l border-gray-100 ml-3 space-y-6">
                {delivery.timeline.map((evt, idx) => (
                  <li key={evt.event_id || idx} className="ml-6">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-black" />
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-black">
                        {evt.kind.replace(/_/g, " ")}
                      </span>
                      <time className="text-[10px] font-mono text-gray-400">
                        {new Date(evt.occurred_at).toLocaleTimeString()} · {new Date(evt.occurred_at).toLocaleDateString()}
                      </time>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-gray-500">
                      <span>Confidence: {Math.round(evt.confidence * 100)}%</span>
                      {evt.camera_id && <span>Camera: {evt.camera_id}</span>}
                      {evt.observations?.track_id != null && <span>Person #{String(evt.observations.track_id)}</span>}
                      {evt.observations?.carried_package === true && <span className="text-red-600 font-bold">left with package</span>}
                      {evt.observations?.came_from_door === true && <span>came from the door</span>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Right column: Risk Assessment & Actions */}
        <div className="lg:col-span-5 space-y-8">
          {/* Risk Card */}
          {delivery.risk && (
            <div
              className={`rounded-2xl border p-6 shadow-sm ${
                riskStyles[delivery.risk.level] || "border-gray-100 bg-gray-50 text-gray-900"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase">
                  AI Risk Assessment
                </span>
                <span className="text-xs font-mono font-extrabold uppercase px-2.5 py-1 rounded bg-black/5">
                  {delivery.risk.level.replace(/_/g, " ")}
                </span>
              </div>

              {delivery.risk.reasons.length > 0 ? (
                <ul className="space-y-2 mt-4 text-xs font-medium leading-relaxed">
                  {delivery.risk.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-sm leading-none">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">No anomaly flags triggered for this delivery.</p>
              )}
            </div>
          )}
          {/* What the system did automatically, and the AI's report */}
          <EdgeInsights deliveryId={delivery.id} />
          {/* Interactive Confirmation and Pickup Actions */}
          <DeliveryActions delivery={delivery} evidence={evidence} />
        </div>
      </div>
    </div>
  );
}
