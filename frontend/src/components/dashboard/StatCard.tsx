import type { LucideIcon } from "lucide-react";

export function StatCard({ title, value, status, icon: Icon }: { title: string; value: string | number; status?: 'default' | 'danger' | 'warning' | 'success'; icon?: LucideIcon }) {
  const accent = status === 'danger' ? 'text-red-500' : status === 'warning' ? 'text-amber-500' : status === 'success' ? 'text-emerald-500' : 'text-black';
  const iconTone = status === 'danger' ? 'bg-red-50 text-red-600' : status === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500';

  return (
    <div className="bg-white p-5 border border-gray-100 rounded-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">{title}</h3>
        {Icon && (
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconTone}`}>
            <Icon className="w-4 h-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className={`mt-3 text-3xl font-black tracking-tighter ${accent}`}>{value}</p>
    </div>
  );
}
