import { getDashboardStats, getActiveDeliveries } from '@/lib/api';
import { StatCard } from '@/components/dashboard/StatCard';
import { ActivityList } from '@/components/dashboard/ActivityList';
import { PackageList } from '@/components/dashboard/PackageList';

export default async function Dashboard() {
 const stats = await getDashboardStats();
 const activeDeliveries = await getActiveDeliveries();

 return (
 <div className="space-y-12 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
 
 {/* Header */}
 <div>
 <h1 className="text-4xl font-bold tracking-tighter text-black">Dashboard</h1>
 <p className="mt-2 text-sm text-gray-500 font-medium">
 Monitoring package security. System status: <span className="text-emerald-600">{stats.monitoringStatus.toUpperCase()}</span>
 </p>
 </div>

 {/* Top Stats Row */}
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <StatCard title="Active Packages" value={stats.activePackages} />
 <StatCard 
 title="Active Incidents" 
 value={stats.activeIncidents} 
 status={stats.activeIncidents > 0 ? 'danger' : 'success'} 
 />
 <StatCard title="Historical Packages" value={stats.historicalPackages} />
 <StatCard title="Monitoring Nodes" value={1} status="success" />
 </div>

 {/* Main Content Grid */}
 <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
 {/* Left Column: Deliveries */}
 <div className="space-y-6">
 <PackageList deliveries={activeDeliveries} />
 </div>

 {/* Right Column: Activity Feed */}
 <div className="space-y-6">
 <ActivityList events={stats.recentActivity} />
 </div>
 </div>

 </div>
 );
}
