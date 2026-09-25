import { Delivery } from '@/types';
import Link from 'next/link';

export function PackageList({ deliveries }: { deliveries: Delivery[] }) {
  const riskStyles = {
    high: 'bg-red-50 text-red-600 border-red-100',
    medium: 'bg-amber-50 text-amber-600 border-amber-100',
    low: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="text-sm font-bold tracking-tight text-black">Active Packages</h3>
      </div>
      <ul className="divide-y divide-gray-50">
        {deliveries.length === 0 ? (
          <li className="px-6 py-5 text-sm text-gray-400">No active packages</li>
        ) : (
          deliveries.map((delivery) => (
            <li key={delivery.id} className="px-6 py-5 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <Link href={`/packages/${delivery.id}`} className="text-sm font-bold text-black hover:underline underline-offset-4">
                    {delivery.id.toUpperCase()}
                  </Link>
                  <p className="text-xs text-gray-400 mt-1 font-mono">
                    {new Date(delivery.created_at).toLocaleString()}
                  </p>
                </div>
                {delivery.risk && (
                  <span className={`text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full border ${riskStyles[delivery.risk.level]}`}>
                    {delivery.risk.level} risk
                  </span>
                )}
              </div>
              {delivery.risk?.reasons?.[0] && (
                <p className="text-xs text-gray-500 bg-gray-50 px-4 py-3 rounded-xl leading-relaxed">
                  {delivery.risk.reasons[0]}
                </p>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
