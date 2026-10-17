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
    high_risk: "bg-red-50 text-red-600 border-red-100",
    suspicious: "bg-amber-50 text-amber-600 border-amber-100",
    needs_confirmation: "bg-blue-50 text-blue-600 border-blue-100",
    normal: "bg-emerald-50 text-emerald-600 border-emerald-100",
  };

  const statusStyles: Record<string, string> = {
    awaiting_delivery: "bg-blue-50 text-blue-700 border-blue-200",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    needs_confirmation: "bg-amber-50 text-amber-700 border-amber-200",
    collected: "bg-purple-50 text-purple-700 border-purple-200",
    incident: "bg-red-50 text-red-700 border-red-200",
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
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-bold tracking-tight text-black">
            Monitored Deliveries
          </h3>
          {loading && (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
          {(
            [
              { id: "all", label: "All" },
              { id: "active", label: "Active" },
              { id: "needs_confirmation", label: "Needs Review" },
              { id: "incident", label: "Incidents" },
              { id: "collected", label: "Collected" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                filter === tab.id
                  ? "bg-black text-white font-bold"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && deliveries.length === 0 ? (
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="animate-pulse space-y-2 border-b border-gray-50 pb-4 last:border-b-0">
              <div className="flex justify-between">
                <div className="h-4 w-36 bg-gray-100 rounded" />
                <div className="h-4 w-20 bg-gray-100 rounded-full" />
              </div>
              <div className="h-3 w-48 bg-gray-50 rounded" />
              <div className="h-8 w-full bg-gray-50 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <li className="px-6 py-10 text-center text-xs text-gray-400 font-mono">
              No deliveries found in &quot;{filter}&quot; state.
            </li>
          ) : (
            filtered.map((delivery) => (
              <li
                key={delivery.id}
                className={`px-6 py-5 flex flex-col gap-3 hover:bg-gray-50/50 transition ${
                  deletingId === delivery.id ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/packages/${delivery.id}`}
                        className="text-sm font-bold font-mono text-black hover:underline underline-offset-4"
                      >
                        {delivery.id.toUpperCase()}
                      </Link>
                      <span
                        className={`text-[9px] font-mono font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${
                          statusStyles[delivery.status] || "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                      >
                        {delivery.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 font-mono">
                      {delivery.camera_id && <span>Camera: {delivery.camera_id} · </span>}
                      {new Date(delivery.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {delivery.risk && (
                      <span
                        className={`text-[10px] font-mono font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border ${
                          riskStyles[delivery.risk.level] || "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {delivery.risk.level.replace(/_/g, " ")}
                      </span>
                    )}
                    <Link
                      href={`/packages/${delivery.id}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition"
                      title="View details & video feed"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
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
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
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
                  <p className="text-xs text-gray-600 bg-gray-50 px-3.5 py-2.5 rounded-xl font-mono text-[11px] leading-relaxed">
                    {delivery.risk.reasons[0]}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
