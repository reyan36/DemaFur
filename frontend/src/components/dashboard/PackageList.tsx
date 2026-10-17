"use client";

import { useState } from "react";
import { Delivery } from "@/types";
import Link from "next/link";

interface PackageListProps {
  deliveries: Delivery[];
  loading?: boolean;
  onDeleted?: (id: string) => void;
}

export function PackageList({ deliveries, loading = false, onDeleted }: PackageListProps) {
  const [filter, setFilter] = useState<"all" | "active" | "needs_confirmation" | "incident" | "collected">("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const riskStyles: Record<string, string> = {
    high_risk: "bg-red-50 text-red-700 border-red-200/80",
    suspicious: "bg-amber-50 text-amber-700 border-amber-200/80",
    needs_confirmation: "bg-blue-50 text-blue-700 border-blue-200/80",
    normal: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  };

  const statusConfig: Record<string, { badge: string; iconBox: string; bar: string }> = {
    awaiting_delivery: {
      badge: "bg-blue-50 text-blue-700 border-blue-200",
      iconBox: "bg-blue-50 text-blue-600 border-blue-200/70",
      bar: "border-l-blue-500",
    },
    delivered: {
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconBox: "bg-emerald-50 text-emerald-600 border-emerald-200/70",
      bar: "border-l-emerald-500",
    },
    needs_confirmation: {
      badge: "bg-amber-50 text-amber-700 border-amber-200",
      iconBox: "bg-amber-50 text-amber-600 border-amber-200/70",
      bar: "border-l-amber-500",
    },
    collected: {
      badge: "bg-zinc-100 text-zinc-700 border-zinc-200",
      iconBox: "bg-zinc-100 text-zinc-600 border-zinc-200/70",
      bar: "border-l-zinc-400",
    },
    incident: {
      badge: "bg-red-50 text-red-700 border-red-200",
      iconBox: "bg-red-50 text-red-600 border-red-200/70",
      bar: "border-l-red-500",
    },
  };

  const counts = {
    all: deliveries.length,
    active: deliveries.filter((d) => d.status === "delivered" || d.status === "awaiting_delivery").length,
    needs_confirmation: deliveries.filter((d) => d.status === "needs_confirmation").length,
    incident: deliveries.filter((d) => d.status === "incident").length,
    collected: deliveries.filter((d) => d.status === "collected").length,
  };

  const filtered = deliveries.filter((d) => {
    if (filter === "all") return true;
    if (filter === "active") return d.status === "delivered" || d.status === "awaiting_delivery";
    if (filter === "needs_confirmation") return d.status === "needs_confirmation";
    if (filter === "incident") return d.status === "incident";
    if (filter === "collected") return d.status === "collected";
    return true;
  });

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-xs">
      {/* Header & Filter Bar */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-900">
            Monitored Deliveries
          </h3>
          {loading && (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin" />
          )}
        </div>

        {/* Filter Pills with Counts */}
        <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
          {(
            [
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "needs_confirmation", label: "Review" },
              { id: "incident", label: "Incidents" },
              { id: "collected", label: "Collected" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                filter === tab.id
                  ? "bg-zinc-900 text-white font-bold shadow-xs"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200/70"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 rounded-full ${
                  filter === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading && deliveries.length === 0 ? (
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="animate-pulse space-y-3 border border-gray-100 p-4 rounded-xl">
              <div className="flex justify-between">
                <div className="h-4 w-40 bg-gray-100 rounded" />
                <div className="h-5 w-24 bg-gray-100 rounded-full" />
              </div>
              <div className="h-3 w-52 bg-gray-50 rounded" />
              <div className="h-9 w-full bg-gray-50 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <li className="px-6 py-14 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto text-gray-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-gray-600">
                No deliveries in &quot;{filter.replace("_", " ")}&quot; state
              </p>
              <p className="text-[11px] text-gray-400">
                Use &quot;Simulate a Camera&quot; above to trigger a live doorstep parcel scenario.
              </p>
            </li>
          ) : (
            filtered.map((delivery) => {
              const cfg = statusConfig[delivery.status] || statusConfig.delivered;
              return (
                <li
                  key={delivery.id}
                  className={`px-6 py-5 flex flex-col gap-3.5 hover:bg-gray-50/60 transition ${
                    deletingId === delivery.id ? "opacity-40 pointer-events-none" : ""
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${cfg.iconBox}`}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/packages/${delivery.id}`}
                            className="text-sm font-black font-mono text-zinc-900 hover:text-black hover:underline underline-offset-4"
                          >
                            {delivery.id.toUpperCase()}
                          </Link>
                          <span
                            className={`text-[10px] font-mono font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${cfg.badge}`}
                          >
                            {delivery.status.replace(/_/g, " ")}
                          </span>
                          {delivery.risk && (
                            <span
                              className={`text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded-md border ${
                                riskStyles[delivery.risk.level] || "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              {delivery.risk.level.replace(/_/g, " ")}
                              {typeof delivery.risk.score === "number" ? ` · ${delivery.risk.score}/100` : ""}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-gray-400 font-mono flex flex-wrap items-center gap-2">
                          {delivery.camera_id && (
                            <span className="text-zinc-600 font-medium">
                              📹 {delivery.camera_id}
                            </span>
                          )}
                          <span>·</span>
                          <span>{new Date(delivery.created_at).toLocaleString()}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Link
                        href={`/packages/${delivery.id}`}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-700 transition flex items-center gap-1.5 shadow-2xs"
                      >
                        <span>Inspect Feed</span>
                        <span>&rarr;</span>
                      </Link>

                      {/* Delete / Dismiss False Alarm Button */}
                      <button
                        disabled={deletingId === delivery.id}
                        onClick={async (e) => {
                          e.preventDefault();
                          if (!confirm(`Dismiss "${delivery.id}" as false alarm and delete?`)) return;
                          setDeletingId(delivery.id);
                          try {
                            const API_URL = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_API_URL || "https://demafur.onrender.com";
                            const API_KEY = process.env.NEXT_PUBLIC_DEMAFUR_API_KEY || "demafur_api_k3y_2026_s3cur3";
                            await fetch(`${API_URL}/v1/deliveries/${delivery.id}`, {
                              method: "DELETE",
                              headers: { Authorization: `Bearer ${API_KEY}` },
                            });
                            if (onDeleted) {
                              onDeleted(delivery.id);
                            }
                          } finally {
                            setDeletingId(null);
                          }
                        }}
                        className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200/80 hover:border-red-200 transition cursor-pointer"
                        title="Dismiss / Delete event (False Alarm)"
                      >
                        {deletingId === delivery.id ? (
                          <span className="w-4 h-4 block rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {delivery.risk?.reasons?.[0] && (
                    <div
                      className={`text-xs text-zinc-700 bg-gray-50/90 px-3.5 py-2.5 rounded-r-xl border border-gray-200/60 border-l-4 ${cfg.bar} font-mono text-[11px] leading-relaxed`}
                    >
                      <span className="font-bold text-zinc-900 mr-1.5">AI HEURISTIC:</span>
                      {delivery.risk.reasons[0]}
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
