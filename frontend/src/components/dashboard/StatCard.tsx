export function StatCard({ title, value, status }: { title: string; value: string | number; status?: 'default' | 'danger' | 'success' }) {
  const accent = status === 'danger' ? 'text-red-500' : status === 'success' ? 'text-emerald-500' : 'text-black';

  return (
    <div className="bg-white p-6 border border-gray-100 rounded-2xl">
      <h3 className="text-xs font-semibold tracking-[0.15em] uppercase text-gray-400">{title}</h3>
      <p className={`mt-3 text-4xl font-black tracking-tighter ${accent}`}>{value}</p>
    </div>
  );
}
