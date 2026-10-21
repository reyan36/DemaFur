import { DashboardClient } from "./DashboardClient";

// Data is loaded in the browser once the user is signed in. Fetching it here made every
// visit (and every redirect after login) wait for the backend before anything appeared.
export default function Dashboard() {
  return <DashboardClient />;
}
