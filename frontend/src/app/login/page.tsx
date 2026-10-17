"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const router = useRouter();
  const { user, signInWithGoogle, signInWithEmail, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const isBusy = googleLoading || emailLoading || resetLoading;

  useEffect(() => {
    router.prefetch("/dashboard");
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign in failed");
      setGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
      setEmailLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }
    setResetLoading(true);
    setError(null);
    setResetSent(false);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send password reset email. Please check the address."
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-[82vh] items-center justify-center p-4 bg-gradient-to-b from-white to-gray-50/60">
      <div className="w-full max-w-md bg-white p-8 sm:p-9 rounded-3xl border border-gray-200/80 shadow-xl shadow-gray-900/5 space-y-6">
        {mode === "reset" ? (
          <>
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-black">
                Reset your password
              </h1>
              <p className="text-xs text-gray-500 leading-relaxed">
                Enter the email address associated with your DemaFur account and we&apos;ll send a secure password reset link.
              </p>
            </div>

            {error && (
              <div className="p-3.5 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {error}
              </div>
            )}

            {resetSent && (
              <div className="p-4 text-xs rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 space-y-1">
                <span className="font-bold block text-emerald-950">✓ Reset link sent!</span>
                <p>
                  Check your inbox (and spam folder) at <strong>{email}</strong> for instructions to set a new password.
                </p>
              </div>
            )}

            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black mb-1.5">
                  Account Email
                </label>
                <input
                  type="email"
                  required
                  disabled={isBusy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/70 text-black text-sm focus:bg-white focus:ring-2 focus:ring-black outline-none transition disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-2.5 bg-black hover:bg-zinc-800 text-white font-bold py-3 px-4 rounded-xl transition text-sm disabled:opacity-60 cursor-pointer shadow-sm"
              >
                {resetLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Sending reset link...</span>
                  </>
                ) : (
                  <span>Send Password Reset Link</span>
                )}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setResetSent(false);
                }}
                className="text-xs font-bold text-gray-600 hover:text-black transition cursor-pointer"
              >
                &larr; Back to sign in
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-3xl font-black tracking-tighter text-black">Welcome back.</h1>
              <p className="text-sm text-gray-500 font-medium mt-1">Sign in to your DemaFur security hub</p>
            </div>

            {error && (
              <div className="p-3.5 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                {error}
              </div>
            )}

            {/* Google Sign In Button */}
            <button
              type="button"
              disabled={isBusy}
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-black font-bold py-3 px-4 rounded-xl border border-gray-200 shadow-xs transition disabled:opacity-60 text-sm cursor-pointer"
            >
              {googleLoading ? (
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
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[11px] font-mono text-gray-400 uppercase">or with email</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  disabled={isBusy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/70 text-black text-sm focus:bg-white focus:ring-2 focus:ring-black outline-none transition disabled:opacity-50"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-black">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("reset");
                      setError(null);
                      setResetSent(false);
                    }}
                    className="text-xs font-semibold text-gray-500 hover:text-black transition cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  disabled={isBusy}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/70 text-black text-sm focus:bg-white focus:ring-2 focus:ring-black outline-none transition disabled:opacity-50"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-2.5 bg-black hover:bg-zinc-800 text-white font-bold py-3 px-4 rounded-xl transition text-sm disabled:opacity-60 mt-2 cursor-pointer shadow-sm"
              >
                {emailLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign in</span>
                )}
              </button>
            </form>

            <p className="text-center text-xs text-gray-500 font-medium">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-black hover:underline font-bold">
                Sign up
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
