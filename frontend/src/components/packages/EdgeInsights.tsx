"use client";

import { useEffect, useState } from "react";
import { BellRing, Lightbulb, Volume2, type LucideIcon } from "lucide-react";
import { DeliveryAction, DeliverySummary, getDeliveryActions, getDeliverySummary } from "@/lib/api";

const ACTION_LABELS: Record<string, { text: string; icon: LucideIcon }> = {
  turn_on_lights: { text: "Porch lights", icon: Lightbulb },
  play_warning: { text: "Spoken warning", icon: Volume2 },
  notify_owner: { text: "Owner alert", icon: BellRing },
};

const STATUS_LABELS: Record<string, { text: string; tone: string }> = {
  queued: { text: "Triggered", tone: "text-emerald-700 bg-emerald-50" },
  simulated: { text: "Done (simulated hardware)", tone: "text-emerald-700 bg-emerald-50" },
  pending_approval: { text: "Waiting for your approval", tone: "text-amber-700 bg-amber-50" },
  rejected: { text: "Rejected by you", tone: "text-gray-600 bg-gray-100" },
  cancelled: { text: "Stood down when risk dropped", tone: "text-gray-600 bg-gray-100" },
};

/** The AI's written report and what the system did automatically for this delivery. */
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
      ? "Written by Groq"
      : summary?.source === "bedrock"
      ? "Written by Amazon Bedrock"
      : summary?.source === "openai"
      ? "Written by OpenAI"
      : "Rule-based summary";

  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold text-black">Incident report</h2>
          {!summaryLoading && summary && <span className="text-[11px] text-gray-400">{source}</span>}
        </div>
        {summaryLoading ? (
          <div className="space-y-2 animate-pulse" aria-label="Writing the report">
            <div className="h-3 rounded bg-gray-100 w-full" />
            <div className="h-3 rounded bg-gray-100 w-11/12" />
            <div className="h-3 rounded bg-gray-100 w-4/5" />
          </div>
        ) : summary ? (
          <p className="text-sm text-gray-800 leading-relaxed">{summary.text}</p>
        ) : (
          <p className="text-sm text-gray-500">The report could not be loaded.</p>
        )}
        <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
          Written from the recorded events. It does not identify anyone or establish intent.
        </p>
      </section>

      <section className="bg-white border border-gray-100 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-black mb-3">Automatic responses</h2>
        {actions === null ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing needed for this delivery.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {actions.map((a) => {
              const status = STATUS_LABELS[a.status] ?? { text: a.status, tone: "text-gray-600 bg-gray-100" };
              const action = ACTION_LABELS[a.kind] ?? { text: a.kind, icon: BellRing };
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center">
                      <action.icon className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="text-sm font-medium text-black block">{action.text}</span>
                      <time className="text-[11px] font-mono text-gray-400">
                        {new Date(a.created_at).toLocaleTimeString()}
                      </time>
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${status.tone}`}>
                    {status.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
