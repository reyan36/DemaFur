import { DashboardStats, Delivery, EvidenceBundle, PickupWindow } from '@/types';

const API_BASE_URL =
  typeof window !== "undefined"
    ? ""
    : (process.env.NEXT_PUBLIC_API_URL || "https://demafur.onrender.com").replace(/\/+$/, "");
// Owner key for the single-household backend. Set it in the deployment's environment; it is
// deliberately not hard-coded here because the repository is public.
const API_KEY = process.env.NEXT_PUBLIC_DEMAFUR_API_KEY || "";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }
  return headers;
}

// POST JSON to the backend with the owner key (through the /v1 proxy in the browser).
export function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/dashboard`, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),   // allow for Render waking up
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

export function fallbackDashboardStats(): DashboardStats {
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

export async function getAllDeliveries(limit = 50, offset = 0): Promise<Delivery[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries?limit=${limit}&offset=${offset}`, {
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
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
      signal: AbortSignal.timeout(20000),   // allow for Render waking up
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
    const res = await fetch(`${API_BASE_URL}/v1/actions?delivery_id=${encodeURIComponent(deliveryId)}`, {
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

export async function deleteDelivery(deliveryId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/v1/deliveries/${deliveryId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not delete ${deliveryId} (${res.status})`);
  }
}

// Deletes every delivery a few at a time so the caller can show progress (0-100).
export async function purgeDeliveries(onProgress: (percent: number) => void): Promise<number> {
  let done = 0;
  let limit = 5;
  for (;;) {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries/purge?limit=${limit}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Reset failed (${res.status})`);
    // A backend without chunked purge deletes everything at once and sends no `remaining`.
    const { purged = 0, remaining = 0 } = await res.json();
    done += purged;
    onProgress(done + remaining === 0 ? 100 : Math.round((done / (done + remaining)) * 100));
    if (!remaining || !purged) return done;
    limit = Math.min(100, Math.max(5, Math.ceil(remaining / 8)));   // about ten steps in total
  }
}
