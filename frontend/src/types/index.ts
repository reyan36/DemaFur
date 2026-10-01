// TypeScript definitions for the DemaFur API

export interface Event {
  event_id: string;
  kind: string; // 'package_delivered', 'motion', 'person_approached', etc.
  occurred_at: string;
  confidence: number;
}

export interface RiskAssessment {
  level: 'normal' | 'needs_confirmation' | 'suspicious' | 'high_risk';
  reasons: string[];
}

export interface Delivery {
  id: string;
  status: 'awaiting_delivery' | 'delivered' | 'needs_confirmation' | 'collected' | 'incident';
  resolution: string | null;
  created_at: string;
  timeline: Event[];
  risk?: RiskAssessment;
}

export interface DashboardStats {
  activePackages: number;
  historicalPackages: number;
  activeIncidents: number;
  pendingConfirmations: number;
  recentActivity: Event[];
  activeDeliveries: Delivery[];
  monitoringStatus: 'healthy' | 'warning' | 'offline';
  monitoringReason?: string;
}
