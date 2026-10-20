"use client";

import { useEffect, useState } from "react";
import { DeliveryAction, DeliverySummary, getDeliveryActions, getDeliverySummary } from "@/lib/api";

const ACTION_LABELS: Record<string, string> = {
  turn_on_lights: "💡 Porch lights on",
  play_warning: "🔊 Spoken warning played",
  notify_owner: "📧 Owner notified",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "triggered automatically",
  simulated: "done (simulated hardware)",
  pending_approval: "waiting for your approval",
  rejected: "rejected by owner",
  cancelled: "no longer needed",
};

/** What the system did about this delivery, and the AI's account of what happened. */
export function EdgeInsights({ deliveryId }: { deliveryId: string }) {
  const [actions, setActions] = useState<DeliveryAction[] | null>(null);
  const [summary, setSummary] = useState<DeliverySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    getDeliveryActions(deliveryId).then(setActions);
    getDeliverySummary(deliveryId).then((s) => {
      setSummary(s);
      setSummaryLoading(false);
    });
  }, [deliveryId]);

  const source =
    summary?.source === "groq"
      ? summary.inference?.fallback_used
        ? "Groq (Bedrock fallback)"
        : "Groq"
      : summary?.source === "bedrock"
      ? "Amazon Bedrock"
      : "Rule-based summary (AI unavailable)";

  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-black tracking-tight mb-4">Automatic responses</h3>
        {actions === null ? (
          <p className="text-xs text-gray-400 font-mono">Loading…</p>
        ) : actions.length === 0 ? (
          <p className="text-xs text-gray-500">No response was needed for this delivery.</p>
        ) : (
          <ul className="space-y-3">
            {actions.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold text-black block">{ACTION_LABELS[a.kind] || a.kind}</span>
                  <span className="text-[11px] font-mono text-gray-500">
                    {a.kind === "notify_owner" && a.status === "queued"
                      ? "alert queued"
                      : STATUS_LABELS[a.status] || a.status}
                  </span>
                </div>
                <time className="text-[10px] font-mono text-gray-400 whitespace-nowrap">
                  {new Date(a.created_at).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-black tracking-tight">AI incident report</h3>
          {!summaryLoading && summary && (
            <span className="text-[10px] font-mono text-gray-400">{source}</span>
          )}
        </div>
        {summaryLoading ? (
          <p className="text-xs text-gray-400 font-mono">Writing the report…</p>
        ) : summary ? (
          <p className="text-sm text-gray-800 leading-relaxed">{summary.text}</p>
        ) : (
          <p className="text-xs text-gray-500">The report could not be loaded.</p>
        )}
        <p className="mt-3 text-[10px] text-gray-400">
          AI-written from the recorded events. It does not identify anyone or establish intent; please review.
        </p>
      </div>
    </div>
  );
}