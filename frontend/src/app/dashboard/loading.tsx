export default function DashboardLoading() {
  return (
    <div className="space-y-10 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-pulse">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-100 pb-8">
        <div className="space-y-3">
          <div className="h-5 w-44 bg-gray-100 rounded-full" />
          <div className="h-10 w-72 bg-gray-200 rounded-xl" />
          <div className="h-4 w-96 bg-gray-100 rounded-lg" />
        </div>
        <div className="h-16 w-72 bg-gray-100 rounded-2xl" />
      </div>

      <div className="flex gap-3">
        <div className="h-10 w-44 bg-gray-200 rounded-xl" />
        <div className="h-10 w-48 bg-gray-100 rounded-xl" />
        <div className="h-10 w-24 bg-gray-100 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-2xl border border-gray-100" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 h-96 bg-gray-100 rounded-2xl" />
        <div className="lg:col-span-5 h-96 bg-gray-100 rounded-2xl" />
      </div>
    </div>
  );
}
