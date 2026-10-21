"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Firebase error codes worth explaining; anything else gets a generic message.
const ERRORS: Record<string, string> = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "Couldn't reach the sign-in service. Check your connection.",
};

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      // Firebase may report unknown accounts; don't reveal whether an account exists.
      if (code === "auth/user-not-found") setSent(true);
      else setError(ERRORS[code] ?? "Couldn't send the reset email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-6">
        {sent ? (
          <div className="text-center space-y-4">
            <span className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <MailCheck className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-black">Check your inbox</h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              If an account exists for <strong className="text-black">{email}</strong>, we&apos;ve sent a
              link to choose a new password. It may take a minute, and can land in spam.
            </p>
            <Link href="/login" className="inline-block text-sm font-semibold text-black hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <span className="w-12 h-12 mx-auto rounded-2xl bg-gray-50 text-black flex items-center justify-center">
                <KeyRound className="w-6 h-6" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-black">Reset your password</h1>
              <p className="text-sm text-gray-500">Enter your email and we&apos;ll send you a reset link.</p>
            </div>

            {error && (
              <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-xs font-bold text-black">
                Email
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-black text-sm font-normal focus:ring-2 focus:ring-black outline-none transition"
                  placeholder="you@example.com"
                />
              </label>
              <button
                type="submit"
                disabled={sending}
                className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition text-sm disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <Link href="/login" className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-black">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
