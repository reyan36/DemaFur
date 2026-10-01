import { DashboardStats, Delivery } from '@/types';

// The base URL should be in your .env.local file (e.g. NEXT_PUBLIC_API_URL=https://demafur.onrender.com)
// Note: NEXT_PUBLIC is used so client-side components can fetch data.
// In a real prod environment, you'd want to use Next.js API routes as a proxy to hide the API key.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const API_KEY = process.env.NEXT_PUBLIC_DEMAFUR_API_KEY || '';

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE_URL}/v1/dashboard`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    console.error('Failed to fetch dashboard stats', await res.text());
    // Fallback for development if backend isn't linked yet
    return {
      activePackages: 0,
      historicalPackages: 0,
      activeIncidents: 0,
      pendingConfirmations: 0,
      recentActivity: [],
      activeDeliveries: [],
      monitoringStatus: 'offline',
      monitoringReason: 'Could not connect to backend API'
    };
  }

  return res.json();
}

export async function getActiveDeliveries(): Promise<Delivery[]> {
  const stats = await getDashboardStats();
  return stats.activeDeliveries || [];
}
