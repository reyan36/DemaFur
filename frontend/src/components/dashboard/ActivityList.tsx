import Link from "next/link";
import { Event } from "@/types";

interface ActivityListProps {
  events: Event[];
  loading?: boolean;
}

export function ActivityList({ events, loading = false }: ActivityListProps) {
  const getEventStyle = (kind: string) => {
    if (kind === "package_removed") {
      return {
        dot: "bg-red-500 ring-red-100",
        badge: "bg-red-50 text-red-700 border-red-200/70",
        label: "Parcel Removed",
      };
    }
    if (kind === "person_approached" || kind === "motion_detected") {
      return {
        dot: "bg-amber-500 ring-amber-100",
        badge: "bg-amber-50 text-amber-700 border-amber-200/70",
        label: "Subject Lingering",
      };
    }
    return {
      dot: "bg-emerald-500 ring-emerald-100",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
      label: "Parcel Delivered",
    };
  };

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden shadow-xs">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-900">
            Optical Telemetry Stream
          </h3>
        </div>
        <span className="text-[11px] font-mono text-gray-400 bg-white px-2.5 py-0.5 rounded-full border border-gray-200/60">
          {events.length} events
        </span>
      </div>

      {loading && events.length === 0 ? (
        <div className="p-6 space-y-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-3 h-3 rounded-full bg-gray-200 mt-1 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-36 bg-gray-100 rounded" />
                <div className="h-3 w-48 bg-gray-50 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="px-6 py-12 text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-gray-600">No camera events recorded</p>
          <p className="text-[11px] text-gray-400">
            Trigger a simulated camera event above to stream real-time observations.
          </p>
        </div>
      ) : (
        <div className="relative px-6 py-4 max-h-[540px] overflow-y-auto">
          <ul className="space-y-4">
            {events.map((event, idx) => {
              const style = getEventStyle(event.kind);
              const confidencePct = Math.round((event.confidence || 0.98) * 100);
              return (
                <li
                  key={event.event_id || idx}
                  className="relative pl-6 pb-4 border-b border-gray-50 last:border-b-0 last:pb-0"
                >
                  {/* Timeline line */}
                  {idx !== events.length - 1 && (
                    <span className="absolute left-[5px] top-4 bottom-0 w-px bg-gray-100" />
                  )}
                  {/* Timeline dot */}
                  <span
                    className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ${style.dot}`}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-zinc-900">
                          {event.kind
                            .replaceAll("_", " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        {event.delivery_id && (
                          <Link
                            href={`/packages/${event.delivery_id}`}
                            className="text-[10px] font-mono font-semibold text-zinc-600 bg-gray-100 hover:bg-black hover:text-white px-2 py-0.5 rounded transition"
                          >
                            {event.delivery_id.toUpperCase()}
                          </Link>
                        )}
                      </div>

                      <p className="text-[11px] text-gray-400 font-mono">
                        {event.camera_id && <span>{event.camera_id} · </span>}
                        {new Date(event.occurred_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}{" "}
                        · {new Date(event.occurred_at).toLocaleDateString()}
                      </p>
                    </div>

                    <span className="shrink-0 text-[10px] font-mono font-bold text-zinc-600 bg-gray-50 border border-gray-200/70 px-2 py-0.5 rounded-md">
                      {confidencePct}% AI
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
