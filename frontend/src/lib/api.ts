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

/**
 * Helper to fetch with a safe timeout that never triggers Next.js Dev Overlay Console TimeoutError.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/v1/dashboard`,
      {
        headers: authHeaders(),
        cache: 'no-store',
      },
      15000
    );

    if (!res.ok) {
      return fallbackDashboardStats();
    }

    return await res.json();
  } catch {
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

export async function getActiveDeliveries(): Promise<Delivery[]> {
  const stats = await getDashboardStats();
  return stats.activeDeliveries || [];
}

export async function getAllDeliveries(limit = 50, offset = 0): Promise<Delivery[]> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/v1/deliveries?limit=${limit}&offset=${offset}`,
      {
        headers: authHeaders(),
        cache: 'no-store',
      },
      15000
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function getDelivery(id: string): Promise<Delivery | null> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE_URL}/v1/deliveries/${id}`,
      {
        headers: authHeaders(),
        cache: 'no-store',
      },
      15000
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
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
    const err = await res.json().catch(() => ({ detail: 'Confirmation failed' }));
    throw new Error(err.detail || 'Confirmation failed');
  }
  return await res.json();
}

export async function deleteDelivery(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/v1/deliveries/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return res.ok;
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
    const err = await res.json().catch(() => ({ detail: 'Failed to create pickup window' }));
    throw new Error(err.detail || 'Failed to create pickup window');
  }
  return await res.json();
}

export async function getPickupWindows(): Promise<PickupWindow[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/pickup-windows`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function revokePickupWindow(windowId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/v1/pickup-windows/${windowId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return res.ok;
}

export async function getEvidence(deliveryId: string): Promise<EvidenceBundle | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/deliveries/${deliveryId}/evidence`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function downloadEvidenceZip(deliveryId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/v1/deliveries/${deliveryId}/evidence.zip`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error('Evidence bundle not available');
  }
  return await res.blob();
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
  } catch {
    return [];
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
  } catch {
    return [];
  }
}

export async function watchDelivery(
  deliveryId: string,
  cameraId: string,
  label = ''
): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/v1/integrations/ring/watch`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      delivery_id: deliveryId,
      camera_id: cameraId,
      label
    })
  });
  return res.ok;
}

export async function stopWatchDelivery(deliveryId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/v1/integrations/ring/watch/${deliveryId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return res.ok;
}

export async function getIntegrationStatus(): Promise<RingIntegrationStatus | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/integrations/status`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
