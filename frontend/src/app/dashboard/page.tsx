import { fallbackDashboardStats } from "@/lib/api";
import { DashboardClient } from "./DashboardClient";

export default function Dashboard() {
  return (
    <DashboardClient
      initialStats={fallbackDashboardStats()}
      initialDeliveries={[]}
    />
  );
}
