import Link from 'next/link';

export default async function PackageDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      
      <div className="flex items-center gap-4">
        <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">
          &larr; Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Package: {id.toUpperCase()}</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
        <p className="text-gray-500 dark:text-gray-400">
          This page will display the full delivery timeline, live view (if active), and allow you to schedule trusted pickups or generate evidence ZIPs.
        </p>
      </div>

    </div>
  );
}
