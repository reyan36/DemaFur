"use client";

import { useState } from "react";
import { Delivery } from "@/types";
import Link from "next/link";
import { ChevronRight, Trash2 } from "lucide-react";
import { deleteDelivery } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { RISK_LABELS, STATUS_LABELS, label } from "@/lib/labels";

interface PackageListProps {
  deliveries: Delivery[];
  onDeleted?: (deliveryId: string) => void;
}

export function PackageList({ deliveries, onDeleted }: PackageListProps) {
  const [filter, setFilter] = useState<"all" | "active" | "needs_confirmation" | "incident" | "collected">("all");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDelivery(pendingDelete);
      onDeleted?.(pendingDelete);
      setPendingDelete(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

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
        <h3 className="text-sm font-bold tracking-tight text-black">
          Monitored Deliveries
        </h3>

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
              className={`px-2.5 py-1 rounded-lg transition ${
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

      <ul className="divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <li className="px-6 py-10 text-center text-xs text-gray-400 font-mono">
            No deliveries found in &quot;{filter}&quot; state.
          </li>
        ) : (
          filtered.map((delivery) => (
            <li key={delivery.id} className="px-6 py-5 flex flex-col gap-3 hover:bg-gray-50/50 transition">
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
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        statusStyles[delivery.status] || "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      {label(STATUS_LABELS, delivery.status)}
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
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                        riskStyles[delivery.risk.level] || "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {label(RISK_LABELS, delivery.risk.level)}
                    </span>
                  )}
                  <Link
                    href={`/packages/${delivery.id}`}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-black hover:bg-gray-100 transition"
                    title="View details & video feed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>

                  {/* Delete / Dismiss False Alarm Button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteError(null);
                      setPendingDelete(delivery.id);
                    }}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition"
                    title="Dismiss / Delete event (False Alarm)"
                  >
                    <Trash2 className="w-4 h-4" />
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this delivery?"
        message={`${pendingDelete?.toUpperCase()} and its events, actions and evidence will be removed. Use this for false alarms.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
