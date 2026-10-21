import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Camera,
  EyeOff,
  FileText,
  Hand,
  Lightbulb,
  ScanEye,
  ShieldAlert,
} from "lucide-react";

const STEPS = [
  {
    icon: Camera,
    title: "Watch the doorstep",
    text: "Your Ring camera, or an edge detector on a home device, reports what happens around the parcel: arrivals, handling, removal.",
  },
  {
    icon: ScanEye,
    title: "Read the situation",
    text: "Each event is weighed against context: a scheduled pickup, someone coming out of the house, or a stranger handling the box.",
  },
  {
    icon: Lightbulb,
    title: "Respond in seconds",
    text: "When risk rises, porch lights and a spoken warning fire straight away, while the person is still at the door.",
  },
  {
    icon: FileText,
    title: "Hand you the report",
    text: "A plain-English incident report, the full timeline and an evidence bundle are ready if the parcel goes missing.",
  },
];

const PRINCIPLES = [
  { icon: EyeOff, title: "Behaviour, not faces", text: "No face recognition, identity or demographic inference. Ever." },
  { icon: ShieldAlert, title: "You make the call", text: "Scores are heuristics, not verdicts. Nothing is reported without you." },
  { icon: BellRing, title: "Deterrence first", text: "The goal is a parcel that never leaves the porch, not a better police report." },
];

export default function LandingPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gray-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,#f4f4f5,transparent_55%)]" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-14 items-center">
          <div className="rise-in">
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Porch-theft prevention for Ring cameras
            </p>
            <h1 className="mt-6 text-5xl sm:text-6xl font-black tracking-tighter leading-[0.95] text-black">
              Stop parcel theft while it&apos;s happening.
            </h1>
            <p className="mt-6 text-lg text-gray-500 leading-relaxed max-w-lg">
              DemaFur watches what happens to your parcel, not who is at the door. When a stranger
              handles it with no pickup expected, the lights come on and a warning plays before it
              walks away.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white text-sm font-semibold rounded-full hover:bg-zinc-800 transition"
              >
                Open the dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/signup"
                className="px-6 py-3 text-sm font-semibold text-black border border-gray-200 rounded-full hover:border-black transition"
              >
                Create an account
              </Link>
            </div>
          </div>

          {/* Product preview: the demo footage with the kind of overlay the dashboard shows */}
          <div className="rise-in [animation-delay:120ms]">
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl ring-1 ring-black/10">
              <video
                src="/videos/package-stolen.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-cover opacity-90"
              />
              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-white bg-black/60 rounded-md px-2 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                front-door · live
              </span>
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/95 text-black rounded-lg px-2.5 py-1.5 shadow">
                  <Hand className="w-3.5 h-3.5 text-orange-600" />
                  Parcel handled · suspicious
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white/95 text-black rounded-lg px-2.5 py-1.5 shadow">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  Porch lights on
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-400 text-center">Demo footage, replayed through the real pipeline.</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-gray-400">How it works</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-black tracking-tighter text-black">
              From doorstep to decision in four steps.
            </h2>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="rounded-2xl border border-gray-100 p-6 hover:border-gray-300 transition">
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center">
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </span>
                  <span className="text-xs font-mono text-gray-300">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-base font-bold text-black">{title}</h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="py-20 px-6 bg-zinc-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          {PRINCIPLES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4">
              <Icon className="w-6 h-6 shrink-0 text-black" strokeWidth={1.75} />
              <div>
                <h3 className="text-base font-bold text-black">{title}</h3>
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter text-black">
            Your camera already sees it. Now it can act.
          </h2>
          <p className="mt-5 text-gray-500 text-lg max-w-xl mx-auto">
            Connect your Ring camera, or watch the demo footage play through the dashboard.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 mt-8 px-8 py-3.5 bg-black text-white text-sm font-semibold rounded-full hover:bg-zinc-800 transition"
          >
            Try it now
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
