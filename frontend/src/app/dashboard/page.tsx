import { getDashboardStats, getAllDeliveries } from "@/lib/api";
import { DashboardClient } from "./DashboardClient";

export default async function Dashboard() {
  const stats = await getDashboardStats();
  const allDeliveries = await getAllDeliveries(50, 0);
  const deliveriesToDisplay =
    allDeliveries.length > 0 ? allDeliveries : stats.activeDeliveries || [];

  return (
    <DashboardClient
      initialStats={stats}
      initialDeliveries={deliveriesToDisplay}
    />
  );
}
