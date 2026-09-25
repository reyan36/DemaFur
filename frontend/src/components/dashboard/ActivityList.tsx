import { Event } from '@/types';

export function ActivityList({ events }: { events: Event[] }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="text-sm font-bold tracking-tight text-black">Recent Activity</h3>
      </div>
      <ul className="divide-y divide-gray-50">
        {events.length === 0 ? (
          <li className="px-6 py-5 text-sm text-gray-400">No recent activity</li>
        ) : (
          events.map((event) => (
            <li key={event.event_id} className="px-6 py-5 flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-black">
                  {event.kind.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  {new Date(event.occurred_at).toLocaleString()}
                </p>
              </div>
              <span className="text-xs font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                {(event.confidence * 100).toFixed(0)}%
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
