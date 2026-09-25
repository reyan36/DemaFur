import { DashboardStats, Delivery } from '@/types';

// Mock data until real backend integration
export async function getDashboardStats(): Promise<DashboardStats> {
  return {
    activePackages: 2,
    historicalPackages: 45,
    activeIncidents: 1,
    monitoringStatus: 'healthy',
    recentActivity: [
      {
        event_id: 'evt-1',
        kind: 'person_approached',
        occurred_at: new Date().toISOString(),
        confidence: 0.89,
      },
      {
        event_id: 'evt-2',
        kind: 'package_delivered',
        occurred_at: new Date(Date.now() - 3600000).toISOString(),
        confidence: 0.95,
      }
    ]
  };
}

export async function getActiveDeliveries(): Promise<Delivery[]> {
  return [
    {
      id: 'parcel-101',
      status: 'active',
      resolution: null,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      timeline: [],
      risk: {
        level: 'medium',
        reasons: ['Person lingering near package for 2 minutes']
      }
    },
    {
      id: 'parcel-102',
      status: 'active',
      resolution: null,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      timeline: [],
      risk: {
        level: 'low',
        reasons: ['Standard delivery pattern observed']
      }
    }
  ];
}
