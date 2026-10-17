export default function PackageDetailLoading() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-10 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div className="space-y-2">
          <div className="h-3 w-32 bg-gray-100 rounded" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-48 bg-gray-200 rounded-lg" />
            <div className="h-5 w-24 bg-gray-100 rounded-full" />
          </div>
        </div>
        <div className="h-4 w-56 bg-gray-100 rounded" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-8">
          <div className="aspect-video w-full rounded-2xl bg-gray-900 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
              <span className="text-xs font-mono text-zinc-400">Loading optical feed &amp; telemetry...</span>
            </div>
          </div>
          <div className="h-64 w-full rounded-2xl bg-gray-100" />
        </div>
        <div className="lg:col-span-5 space-y-6">
          <div className="h-44 w-full rounded-2xl bg-gray-100" />
          <div className="h-64 w-full rounded-2xl bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
