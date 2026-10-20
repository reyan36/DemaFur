import {
  DashboardStats,
  Delivery,
  EvidenceBundle,
  PickupWindow,
  AnalysisJob,
  RingIntegrationStatus,
  RingDevice
} from '@/types';

const API_BASE_URL =
  typeof window !== "undefined"
    ? ""
    : process.env.NEXT_PUBLIC_API_URL || "https://demafur.onrender.com";
const API_KEY = process.env.NEXT_PUBLIC_DEMAFUR_API_KEY || "demafur_api_k3y_2026_s3cur3";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/dashboard`, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      console.error('Failed to fetch dashboard stats', await res.text());
      return fallbackDashboardStats();
    }

    return await res.json();
  } catch (err) {
    console.error('Network error fetching dashboard stats:', err);
    return fallbackDashboardStats();
  }
}

function fallbackDashboardStats(): DashboardStats {
  return {
    activePackages: 0,
    historicalPackages: 0,
    activeIncidents: 0,
    pendingConfirmations: 0,
    recentActivity: [],
    activeDeliveries: [],
    monitoringStatus: 'offline',
    monitoringReason: 'Connecting to security hub...'
  };
}

export async function getActiveDeliveries(): Promise<Delivery[]> {
  const stats = await getDashboardStats();
  return stats.activeDeliveries || [];
}

export async function getAllDeliveries(limit = 50, offset = 0): Promise<Delivery[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries?limit=${limit}&offset=${offset}`, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error('Failed to fetch deliveries:', err);
    return [];
  }
}

export async function getDelivery(id: string): Promise<Delivery | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries/${id}`, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch delivery ${id}:`, err);
    return null;
  }
}

export async function confirmDelivery(
  id: string,
  outcome: 'expected' | 'unsure' | 'missing'
): Promise<Delivery | null> {
  const res = await fetch(`${API_BASE_URL}/v1/deliveries/${id}/confirmation`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ outcome })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Confirmation failed: ${text}`);
  }
  return await res.json();
}

export async function createPickupWindow(
  deliveryId: string,
  startsAt: string,
  endsAt: string
): Promise<PickupWindow> {
  const res = await fetch(`${API_BASE_URL}/v1/pickup-windows`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      delivery_id: deliveryId,
      starts_at: startsAt,
      ends_at: endsAt
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to schedule pickup window: ${text}`);
  }
  return await res.json();
}

export async function getEvidence(deliveryId: string): Promise<EvidenceBundle | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries/${deliveryId}/evidence`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`Failed to fetch evidence for ${deliveryId}:`, err);
    return null;
  }
}

export function getEvidenceZipUrl(deliveryId: string): string {
  return `${API_BASE_URL}/v1/deliveries/${deliveryId}/evidence.zip`;
}

export async function downloadEvidenceZip(deliveryId: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries/${deliveryId}/evidence.zip`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch (err) {
    console.error(`Failed to download evidence ZIP for ${deliveryId}:`, err);
    return null;
  }
}

export async function getAnalysisJobs(): Promise<AnalysisJob[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/analysis/jobs`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch (err) {
    console.error('Failed to fetch analysis jobs:', err);
    return [];
  }
}

export function getClipUrl(jobId: string): string {
  return `${API_BASE_URL}/v1/analysis/jobs/${jobId}/clip`;
}

export async function getIntegrationStatus(): Promise<RingIntegrationStatus | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/integrations/status`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch integration status:', err);
    return null;
  }
}

export async function getRingDevices(): Promise<RingDevice[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/integrations/ring/devices`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch (err) {
    console.error('Failed to fetch Ring devices:', err);
    return [];
  }
}

export async function watchDelivery(
  deviceId: string,
  componentId: string,
  deliveryId: string
): Promise<{ delivery_id: string; camera_id: string; state: string }> {
  const res = await fetch(`${API_BASE_URL}/v1/integrations/ring/watch`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      device_id: deviceId,
      component_id: componentId,
      delivery_id: deliveryId
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to start watch: ${text}`);
  }
  return await res.json();
}

export async function stopWatchDelivery(deliveryId: string): Promise<{ watching: boolean }> {
  const res = await fetch(`${API_BASE_URL}/v1/integrations/ring/watch/${deliveryId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to stop watch: ${text}`);
  }
  return await res.json();
}


// Actions the backend queued for a delivery: owner notification and porch deterrents.
export interface DeliveryAction {
  id: string;
  delivery_id: string;
  kind: string;      // 'notify_owner' | 'turn_on_lights' | 'play_warning'
  status: string;    // 'queued' | 'pending_approval' | 'simulated' | 'rejected' | 'cancelled'
  reason: string;
  created_at: string;
}

export async function getDeliveryActions(deliveryId: string): Promise<DeliveryAction[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/actions`, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).filter((a: DeliveryAction) => a.delivery_id === deliveryId);
  } catch (err) {
    console.error('Failed to fetch actions:', err);
    return [];
  }
}

// AI-written summary of a delivery (Bedrock, or Groq when Bedrock is unavailable).
export interface DeliverySummary {
  text: string;
  source: string;    // 'bedrock' | 'groq' | 'policy_template'
  ai_unavailable?: boolean;
  error?: string;
  inference?: { provider?: string; fallback_used?: boolean };
}

export async function getDeliverySummary(deliveryId: string): Promise<DeliverySummary | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries/${deliveryId}/summary`, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),   // the AI can take several seconds
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch summary:', err);
    return null;
  }
}