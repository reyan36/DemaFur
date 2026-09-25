"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import Link from "next/link";
import { ThiefSilhouette } from "@/components/ui/ThiefSilhouette";

export default function LandingPage() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline();

    // Phase 1: Overlay slides right, thief rides along at the edge
    tl.to(overlayRef.current, {
      x: "100%",
      duration: 2.5,
      ease: "power3.inOut",
    }, 0.4);

    // Phase 2: Content reveals
    tl.fromTo(heroRef.current,
      { opacity: 0, y: 60, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" },
      1.6
    );

    tl.fromTo(taglineRef.current,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
      2.0
    );

    tl.fromTo(ctaRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
      2.3
    );

    tl.fromTo(featuresRef.current,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
      2.5
    );

    return () => { tl.kill(); };
  }, []);

  return (
    <div className="relative overflow-hidden bg-white">

      {/* ── Entrance overlay ── */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 bg-black pointer-events-none"
      >
        {/* Thief is positioned at the right edge of the overlay */}
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full"
        >
          <ThiefSilhouette className="w-24 h-40 text-black drop-shadow-2xl" />
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center px-6">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:60px_60px] opacity-60" />

        <div ref={heroRef} className="relative z-10 text-center max-w-5xl mx-auto opacity-0">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-gray-400 mb-6">
            AI-Powered Delivery Security
          </p>
          <h1 className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.85] text-black">
            Protect
            <br />
            <span className="text-gray-300">What&apos;s</span>
            <br />
            Yours.
          </h1>
        </div>

        <p
          ref={taglineRef}
          className="relative z-10 mt-10 text-lg sm:text-xl text-gray-500 max-w-xl text-center font-medium leading-relaxed opacity-0"
        >
          DemaFur watches behavior, not faces. Your packages stay safe
          with context-aware AI that prevents theft before it happens.
        </p>

        <div ref={ctaRef} className="relative z-10 mt-10 flex items-center gap-4 opacity-0">
          <Link
            href="/dashboard"
            className="group px-8 py-4 bg-black text-white text-sm font-semibold rounded-full
                       hover:bg-gray-900 transition-all hover:shadow-[0_0_30px_rgba(0,0,0,0.15)]
                       hover:scale-[1.02] active:scale-[0.98]"
          >
            Launch Dashboard →
          </Link>
          <Link
            href="/signup"
            className="px-8 py-4 text-sm font-semibold text-black border border-gray-200
                       rounded-full hover:border-black transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* ── Features ── */}
      <section ref={featuresRef} className="py-32 px-6 opacity-0">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <p className="text-xs font-semibold tracking-[0.3em] uppercase text-gray-400 mb-4">How it works</p>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tighter text-black">
              Four layers of protection.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-100">
            {[
              {
                num: "01",
                title: "Event Logging",
                desc: "Every delivery is timestamped and snapshotted the moment it arrives at your door.",
              },
              {
                num: "02",
                title: "Behavior Analysis",
                desc: "AI tracks motion patterns and context — not identities. A person lingering is different from a neighbor walking past.",
              },
              {
                num: "03",
                title: "Proactive Response",
                desc: "When risk is detected, DemaFur can trigger lights, sound alerts, or notify you — before the package disappears.",
              },
              {
                num: "04",
                title: "Evidence Bundle",
                desc: "If something goes wrong, a full timeline, clips, and a report draft are generated automatically for filing.",
              },
            ].map((feature) => (
              <div
                key={feature.num}
                className="bg-white p-10 sm:p-14 group"
              >
                <span className="text-xs font-mono text-gray-300 tracking-widest">
                  {feature.num}
                </span>
                <h3 className="mt-4 text-xl font-bold tracking-tight text-black">
                  {feature.title}
                </h3>
                <p className="mt-3 text-gray-500 leading-relaxed text-sm">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="bg-black text-white py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-6xl font-black tracking-tighter leading-tight">
            Stop watching.<br />Start protecting.
          </h2>
          <p className="mt-6 text-gray-400 text-lg max-w-xl mx-auto">
            Set up in minutes. No cameras to replace, no subscriptions to manage.
            DemaFur plugs into your existing Ring setup.
          </p>
          <Link
            href="/signup"
            className="inline-block mt-10 px-10 py-4 bg-white text-black text-sm font-semibold
                       rounded-full hover:bg-gray-100 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Create Free Account
          </Link>
        </div>
      </section>
    </div>
  );
}
