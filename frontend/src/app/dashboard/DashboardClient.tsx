"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { CircleHelp, Lock, Package, PackageCheck, ShieldAlert } from "lucide-react";
import { DashboardStats, Delivery } from "@/types";
import { getDashboardStats, getAllDeliveries, fallbackDashboardStats } from "@/lib/api";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityList } from "@/components/dashboard/ActivityList";
import { PackageList } from "@/components/dashboard/PackageList";
import { CameraControls } from "@/components/dashboard/CameraControls";
import { LiveDoorCamera } from "@/components/dashboard/LiveDoorCamera";

export function DashboardClient() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(fallbackDashboardStats);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loaded, setLoaded] = useState(false);
  const lastSummary = useRef<string | null>(null);

  // The summary changes whenever any delivery does, so the full list is only fetched again
  // when it changed (or when forced after the user's own change).
  const refreshData = async (force = true) => {
    try {
      const newStats = await getDashboardStats();
      setStats(newStats);
      const summary = JSON.stringify([
        newStats.activePackages, newStats.historicalPackages, newStats.activeIncidents,
        newStats.pendingConfirmations, newStats.recentActivity.map((e) => e.event_id)]);
      if (force || summary !== lastSummary.current) {
        lastSummary.current = summary;
        const list = await getAllDeliveries(50, 0);
        setDeliveries(list.length > 0 ? list : newStats.activeDeliveries || []);
      }
    } catch (err) {
      console.error("Refresh error:", err);
    } finally {
      setLoaded(true);
    }
  };

  const [loginError, setLoginError] = useState<string | null>(null);
  const [guestMode, setGuestMode] = useState(false);

  // Load once signed in, then keep stats and the package list current while the camera is
  // producing events. Skipped while the tab is hidden: every poll is a Firestore read.
  useEffect(() => {
    if (!user && !guestMode) return;
    const first = setTimeout(() => void refreshData(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshData(false);
    }, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [user, guestMode]);

  const handleGoogleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in error";
      setLoginError(msg);
    }
  };

  // If loading authentication state
  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-black border-t-transparent animate-spin" />
        <span className="text-xs font-mono text-gray-400">Checking your sign-in…</span>
      </div>
    );
  }

  // If not logged in and not in guest bypass mode: Protected screen requiring Google Login
  if (!user && !guestMode) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-black text-white flex items-center justify-center mx-auto shadow-md">
            <Lock className="w-7 h-7" strokeWidth={1.75} />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-black">
              Sign in to your dashboard
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Your deliveries and camera events are private to your household.
            </p>
          </div>

          {loginError && (
            <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 text-left font-mono">
              <span className="font-bold block mb-0.5">Sign-in failed</span>
              {loginError}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-black font-bold py-3 px-4 rounded-2xl border border-gray-200 shadow-sm transition text-sm cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google
          </button>

          <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
            <Link href="/login" className="text-gray-600 font-bold hover:underline">
              Email login
            </Link>
            <button
              onClick={() => setGuestMode(true)}
              className="text-gray-400 hover:text-black font-mono transition underline"
            >
              Try the demo without an account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ringSandbox = Boolean(stats.integrations?.ring_sandbox);
  const ringConnected = ringSandbox || Boolean(
    stats.integrations?.ring_configured && !stats.integrations?.ring_disabled);

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-black">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Parcels at your door, what the camera saw, and what needs your attention.</p>
      </div>

      {/* Live front door camera from the edge detector (shown when NEXT_PUBLIC_EDGE_STREAM_URL is set) */}
      <LiveDoorCamera />

      <CameraControls
        ringConnected={ringConnected}
        ringSandbox={ringSandbox}
        onEventCreated={() => refreshData(false)}
        onClearAll={refreshData}
      />

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active packages" icon={Package} value={loaded ? stats.activePackages : "…"} />
        <StatCard
          title="Needs review"
          icon={CircleHelp}
          value={loaded ? stats.pendingConfirmations : "…"}
          status={stats.pendingConfirmations > 0 ? "warning" : "default"}
        />
        <StatCard
          title="Active incidents"
          icon={ShieldAlert}
          value={loaded ? stats.activeIncidents : "…"}
          status={stats.activeIncidents > 0 ? "danger" : "success"}
        />
        <StatCard title="Resolved" icon={PackageCheck} value={loaded ? stats.historicalPackages : "…"} />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Deliveries (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {loaded ? (
            <PackageList
              deliveries={deliveries}
              onDeleted={(id) => {
                setDeliveries((list) => list.filter((d) => d.id !== id));   // show it gone at once
                refreshData();
              }}
            />
          ) : (
            <p className="text-xs font-mono text-gray-400">Loading your packages…</p>
          )}
        </div>

        {/* Right Column: Activity Feed (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <ActivityList events={stats.recentActivity} />
        </div>
      </div>
    </div>
  );
}
