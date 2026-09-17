import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Camera,
  Car,
  Cpu,
  Gauge as GaugeIcon,
  History,
  Keyboard,
  Network,
  Radar,
  Terminal,
  Usb,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useObd } from "@/lib/obd/store";
import { cn } from "@/lib/utils";
import { ConnectionBar } from "./ConnectionBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NAV = [
  { to: "/", label: "Dashboard", icon: GaugeIcon },
  { to: "/codes", label: "Fault Codes", icon: AlertTriangle },
  { to: "/deep-scan", label: "Deep Scan", icon: Radar },
  { to: "/freeze-frame", label: "Freeze Frame", icon: Camera },
  { to: "/vehicle", label: "Vehicle Info", icon: Cpu },
  { to: "/canbus", label: "CAN Bus", icon: Network },
  { to: "/actuations", label: "Actuation Tests", icon: Wrench },
  { to: "/expert", label: "Expert Console", icon: Terminal },
  { to: "/garage", label: "Garage", icon: Car },
  { to: "/sessions", label: "Sessions", icon: History },
  { to: "/compare", label: "Compare", icon: ArrowLeftRight },
  { to: "/adapters", label: "Adapters", icon: Usb },
] as const;

export const SHORTCUTS = [
  ["R", "Reconnect adapter"],
  ["S", "Scan fault codes"],
  ["C", "Clear fault codes (confirm)"],
  ["E", "Export / print report"],
  ["L", "Pause or resume live data"],
  ["G", "Save current session"],
  ["?", "Show this list"],
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { reconnect, scanDtcs, clearDtcs, polling, setPolling, saveSession, state, dtcs } = useObd();
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") void reconnect();
      else if (k === "s") void scanDtcs();
      else if (k === "c") setConfirmClear(true);
      else if (k === "e") window.print();
      else if (k === "l") setPolling(!polling);
      else if (k === "g") saveSession();
      else if (e.key === "?") setHelpOpen(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [polling, reconnect, saveSession, scanDtcs, setPolling]);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Activity className="size-6 text-signal" />
          <div>
            <div className="font-display text-base font-bold tracking-widest">TORQUEDECK</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Standards-based OBD-II scanner
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
                {to === "/codes" && dtcs.length > 0 && (
                  <span className="readout ml-auto rounded bg-danger px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {dtcs.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={() => setHelpOpen(true)}
          className="m-3 flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Keyboard className="size-4" /> Keyboard shortcuts
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBar />
        <nav className="no-print flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="whitespace-nowrap rounded px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 px-5 py-6 xl:px-8">{children}</main>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Work without leaving the gauges.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {SHORTCUTS.map(([key, desc]) => (
              <li key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{desc}</span>
                <kbd className="readout rounded border border-border bg-muted px-2 py-0.5 text-xs">
                  {key}
                </kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear stored fault codes?</DialogTitle>
            <DialogDescription>
              Clearing erases the symptom, not the cause. The warning light returns as soon as the
              fault repeats, and readiness monitors reset — the car may fail an emissions test until
              a full drive cycle completes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
              onClick={() => {
                setConfirmClear(false);
                if (state !== "connected") {
                  toast.error("Connect an adapter first");
                  return;
                }
                void clearDtcs();
              }}
            >
              Clear codes
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
