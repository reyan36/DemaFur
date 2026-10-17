"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { DashboardStats, Delivery } from "@/types";
import { getDashboardStats, getAllDeliveries } from "@/lib/api";
import { StatCard } from "@/components/dashboard/StatCard";
import { ActivityList } from "@/components/dashboard/ActivityList";
import { PackageList } from "@/components/dashboard/PackageList";
import { CameraControls } from "@/components/dashboard/CameraControls";

interface DashboardClientProps {
  initialStats: DashboardStats;
  initialDeliveries: Delivery[];
}

export function DashboardClient({ initialStats, initialDeliveries }: DashboardClientProps) {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [googleLoginLoading, setGoogleLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [guestMode, setGuestMode] = useState(false);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1. Fetch fast dashboard overview first to populate stats & active deliveries immediately
      const statsPromise = getDashboardStats().then((newStats) => {
        setStats(newStats);
        setDeliveries((prev) =>
          prev.length === 0 && newStats.activeDeliveries?.length
            ? newStats.activeDeliveries
            : prev
        );
        setInitialLoading(false);
        return newStats;
      });

      // 2. Fetch full deliveries list in parallel
      const deliveriesPromise = getAllDeliveries(50, 0);

      const [newStats, newDeliveries] = await Promise.all([
        statsPromise,
        deliveriesPromise,
      ]);

      setDeliveries(
        newDeliveries.length > 0 ? newDeliveries : newStats.activeDeliveries || []
      );
    } catch {
      // Handled gracefully by api.ts fallbacks
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user || guestMode) {
      refreshData();
    }
  }, [user, guestMode, refreshData]);

  const handleGoogleLogin = async () => {
    setGoogleLoginLoading(true);
    setLoginError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in error";
      setLoginError(msg);
    } finally {
      setGoogleLoginLoading(false);
    }
  };

  // If loading authentication state
  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-black border-t-transparent animate-spin" />
        <span className="text-xs font-mono text-gray-400">Verifying security session...</span>
      </div>
    );
  }

  // If not logged in and not in guest bypass mode: Protected screen requiring Google Login
  if (!user && !guestMode) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-3xl p-8 sm:p-10 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-black text-white flex items-center justify-center mx-auto shadow-md">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-black">
              Restricted Security Access
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Your DemaFur household security dashboard and live Ring camera feeds are protected. Please authenticate to continue.
            </p>
          </div>

          {loginError && (
            <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 text-left font-mono">
              <span className="font-bold block mb-0.5">Authentication Note:</span>
              {loginError}
            </div>
          )}

          <button
            disabled={googleLoginLoading}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-black font-bold py-3 px-4 rounded-2xl border border-gray-200 shadow-sm transition text-sm cursor-pointer disabled:opacity-60"
          >
            {googleLoginLoading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                <span>Authenticating with Google...</span>
              </>
            ) : (
              <>
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
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
            <Link href="/login" className="text-gray-600 font-bold hover:underline">
              Email login
            </Link>
            <button
              onClick={() => setGuestMode(true)}
              className="text-gray-400 hover:text-black font-mono transition underline cursor-pointer"
            >
              Continue as Guest (Dev Bypass)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const monitoringStatus = stats.monitoringStatus || "offline";

  return (
    <div className="space-y-10 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-100 pb-8">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Authenticated · {user?.displayName || user?.email || "Guest Mode (Dev)"}
            </span>
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-gray-500 bg-gray-50 px-2.5 py-0.5 rounded-full border border-gray-200">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                Syncing live telemetry...
              </span>
            )}
          </div>
          <h1 className="text-4xl font-black tracking-tight text-black">
            Security Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            AI-supervised doorstep monitoring and parcel theft defense.
          </p>
        </div>

        {/* Live System Status Widget */}
        <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-2xl p-4 self-start md:self-auto">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3 h-3 rounded-full ${
                monitoringStatus === "healthy"
                  ? "bg-emerald-500"
                  : monitoringStatus === "warning"
                  ? "bg-amber-500"
                  : "bg-red-500"
              } animate-pulse`}
            />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">
                Ring Hub Status
              </span>
              <span className="text-xs font-mono font-bold uppercase text-black">
                {monitoringStatus === "warning"
                  ? "Staging / Active"
                  : monitoringStatus.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-gray-200" />

          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block">
              Optical AI
            </span>
            <span className="text-xs font-mono font-bold uppercase text-black">
              {stats.integrations?.vision_configured ? "AWS Bedrock Active" : "Vision Sampling Ready"}
            </span>
          </div>

          <div className="h-8 w-px bg-gray-200 hidden sm:block" />

          <button
            type="button"
            disabled={refreshing}
            onClick={refreshData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-100 border border-gray-200 transition text-[11px] font-mono font-bold text-gray-700 hover:text-black shadow-xs disabled:opacity-50 cursor-pointer"
            title="Refresh dashboard telemetry"
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-black" : "text-gray-500"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">{refreshing ? "Syncing" : "Refresh"}</span>
          </button>

          <a
            href="https://stats.uptimerobot.com/5q6oQH46Zd"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-100 border border-gray-200 transition text-[11px] font-mono font-bold text-gray-700 hover:text-black shadow-xs"
            title="View public UptimeRobot status page"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Uptime ↗</span>
          </a>
        </div>
      </div>

      {/* Camera Controls & Simulation Tools */}
      <CameraControls
        onEventCreated={refreshData}
        onClearAll={() => {
          setDeliveries([]);
          refreshData();
        }}
      />

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Packages" value={stats.activePackages} />
        <StatCard
          title="Needs Confirmation"
          value={stats.pendingConfirmations}
          status={stats.pendingConfirmations > 0 ? "warning" : "default"}
        />
        <StatCard
          title="Active Incidents"
          value={stats.activeIncidents}
          status={stats.activeIncidents > 0 ? "danger" : "success"}
        />
        <StatCard title="Historical Packages" value={stats.historicalPackages} />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Deliveries (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <PackageList
            deliveries={deliveries}
            loading={initialLoading || refreshing}
            onDeleted={(deletedId) => {
              setDeliveries((prev) => prev.filter((d) => d.id !== deletedId));
              refreshData();
            }}
          />
        </div>

        {/* Right Column: Activity Feed (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <ActivityList events={stats.recentActivity} />
        </div>
      </div>
    </div>
  );
}
