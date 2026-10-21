// Shown instantly while the delivery loads from the backend.
export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse" aria-label="Loading delivery">
      <div className="h-4 w-24 rounded bg-gray-100" />
      <div className="h-8 w-64 rounded bg-gray-100" />
      <div className="h-20 rounded-2xl bg-gray-100" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 aspect-video rounded-2xl bg-gray-100" />
        <div className="lg:col-span-5 h-64 rounded-2xl bg-gray-100" />
      </div>
    </div>
  );
}
