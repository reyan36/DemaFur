// TypeScript definitions for the DemaFur API

export interface Event {
  event_id: string;
  delivery_id?: string;
  camera_id?: string;
  kind: string; // 'package_delivered', 'package_removed', 'motion', 'doorbell', 'person_approached', etc.
  occurred_at: string;
  confidence: number;
  observations?: {
    duration_seconds?: number;
    looking_around?: boolean;
    [key: string]: unknown;
  };
  media_ref?: string | null;
  provenance?: string;
}

export interface RiskAssessment {
  level: 'normal' | 'needs_confirmation' | 'suspicious' | 'high_risk';
  score?: number;
  reasons: string[];
}

export interface PickupWindow {
  id: string;
  delivery_id: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  revoked: number;
}

export interface Delivery {
  id: string;
  camera_id: string;
  status: 'awaiting_delivery' | 'delivered' | 'needs_confirmation' | 'collected' | 'incident';
  resolution: string | null;
  resolved_at?: string | null;
  created_at: string;
  timeline: Event[];
  risk?: RiskAssessment;
  analysis_coverage?: 'unavailable' | 'pending' | 'sampled_frames' | 'not_analyzed';
}

export interface EvidenceRecording {
  job_id: string;
  path: string;
  media?: Record<string, unknown>;
}

export interface EvidenceBundle {
  delivery_id: string;
  incident_at: string;
  status: string;
  camera_id: string;
  assessment: RiskAssessment;
  timeline: Event[];
  report_draft: string;
  neighbours_draft: string;
  created_at: string;
  included_recordings?: EvidenceRecording[];
  recordings_not_included?: number;
  clip_extraction?: string;
}

export interface AnalysisJob {
  id: string;
  delivery_id: string;
  camera_id: string;
  device_id: string;
  component_id?: string;
  occurred_at: string;
  event_kind: 'motion' | 'doorbell' | string;
  state: 'queued' | 'processing' | 'completed' | 'retry' | 'failed';
  attempts: number;
  error?: string | null;
  media?: {
    duration_ms?: number;
    width?: number;
    height?: number;
    [key: string]: unknown;
  } | null;
  analysis?: {
    summary?: string;
    detected_objects?: string[];
    risk_indicators?: string[];
    [key: string]: unknown;
  } | null;
  created_at: string;
}

export interface RingDevice {
  id: string;
  description: string;
  kind?: string;
  components?: string[];
}

export interface RingIntegrationStatus {
  ring_configured: boolean;
  ring_disabled: boolean;
  vision_enabled: boolean;
  vision_configured: boolean;
  ffmpeg_available: boolean;
  database: string;
  jobs: Record<string, number>;
  hardware_actions: string;
  onboarding: string;
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
  integrations?: RingIntegrationStatus;
  generatedAt?: string;
}
