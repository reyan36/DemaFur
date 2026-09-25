// TypeScript definitions for the DemaFur API

export interface Event {
  event_id: string;
  kind: string; // 'package_delivered', 'motion', 'person_approached', etc.
  occurred_at: string;
  confidence: number;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface Delivery {
  id: string;
  status: 'active' | 'missing' | 'retrieved';
  resolution: string | null;
  created_at: string;
  timeline: Event[];
  risk?: RiskAssessment;
}

export interface DashboardStats {
  activePackages: number;
  historicalPackages: number;
  recentActivity: Event[];
  activeIncidents: number;
  monitoringStatus: 'healthy' | 'warning' | 'offline';
}
