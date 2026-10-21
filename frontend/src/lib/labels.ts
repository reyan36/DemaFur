import { Activity, BellRing, Footprints, Hand, House, LogOut, Package, PackageX, Timer, type LucideIcon } from "lucide-react";

// Plain-English names for backend codes, shared by the dashboard and the package page.

export const EVENT_LABELS: Record<string, string> = {
  package_delivered: "Parcel delivered",
  person_approached: "Person approached",
  person_lingering: "Person lingered nearby",
  package_touched: "Parcel handled",
  package_removed: "Parcel picked up",
  person_left: "Person left",
  entered_home: "Carried inside",
  doorbell: "Doorbell pressed",
  motion: "Motion detected",
};

export const STATUS_LABELS: Record<string, string> = {
  awaiting_delivery: "Awaiting delivery",
  delivered: "On the doorstep",
  needs_confirmation: "Needs review",
  collected: "Collected",
  incident: "Incident",
};

export const RISK_LABELS: Record<string, string> = {
  normal: "Normal",
  needs_confirmation: "Needs review",
  suspicious: "Suspicious",
  high_risk: "High risk",
};

// Badge colours by risk level.
export const RISK_BADGES: Record<string, string> = {
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  needs_confirmation: "bg-amber-50 text-amber-700 border-amber-200",
  suspicious: "bg-orange-50 text-orange-700 border-orange-200",
  high_risk: "bg-red-50 text-red-700 border-red-200",
};

export const label = (map: Record<string, string>, code: string) =>
  map[code] ?? code.replace(/_/g, " ");

// One icon per event kind, used in timelines.
export const EVENT_ICONS: Record<string, LucideIcon> = {
  package_delivered: Package,
  person_approached: Footprints,
  person_lingering: Timer,
  package_touched: Hand,
  package_removed: PackageX,
  person_left: LogOut,
  entered_home: House,
  doorbell: BellRing,
  motion: Activity,
};
