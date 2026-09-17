import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cog, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useObd } from "@/lib/obd/store";
import { detectBrowserHardwareSupport } from "@/lib/obd/hardware";
import { loadSettings, saveSettings, type AppSettings } from "@/lib/obd/settings";
import {
  HIGH_RISK_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  loadOperator,
  permissionState,
  saveOperator,
  type Operator,
  type Permission,
} from "@/lib/obd/roles";
import { appendAudit } from "@/lib/obd/audit";
import { featureMatrix } from "@/lib/obd/availability";
import { listDatasets } from "@/lib/obd/dataset-registry";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings, Roles & Capabilities | Vehicle Insight Hub" },
      {
        name: "description",
        content:
          "Set units, theme, language and time zone, choose the operator role, authorise high-risk actions and review what this browser and adapter actually support.",
      },
      { property: "og:title", content: "Settings, Roles & Capabilities | Vehicle Insight Hub" },
      { property: "og:description", content: "Role-based permissions with explicit authorisation for high-risk operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { state, capabilities } = useObd();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [operator, setOperator] = useState<Operator>(loadOperator);
  const support = typeof window !== "undefined" ? detectBrowserHardwareSupport() : null;
  const datasetCount = listDatasets().length;

  useEffect(() => {
    setSettings(loadSettings());
    setOperator(loadOperator());
  }, []);

  const patchSettings = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const setRole = (role: Operator["role"]) => {
    const next: Operator = { ...operator, role, authorized: [] };
    setOperator(next);
    saveOperator(next);
  };

  const toggleAuthorization = async (permission: Permission) => {
    const granted = operator.authorized.includes(permission);
    if (!granted) {
      const confirmed = window.confirm(
        `Authorise ${permission}?\n\nThis is a high-risk operation. It will be recorded in the audit log against ${
          operator.name || "an unnamed operator"
        }.`,
      );
      if (!confirmed) return;
    }
    const next: Operator = {
      ...operator,
      authorized: granted
        ? operator.authorized.filter((entry) => entry !== permission)
        : [...operator.authorized, permission],
    };
    setOperator(next);
    saveOperator(next);
    await appendAudit({
      user: operator.name || "UNNAMED OPERATOR",
      role: next.role,
      vehicle: null,
      vin: null,
      ecu: null,
      file: null,
      calibration: null,
      operation: granted ? `Authorisation revoked: ${permission}` : `Authorisation granted: ${permission}`,
      permission,
      authorization: granted ? "REVOKED BY OPERATOR" : "EXPLICITLY CONFIRMED BY OPERATOR",
      hardware: null,
      result: "SUCCESS",
      errors: [],
    });
  };

  const matrix = featureMatrix({
    browserSupported: Boolean(support?.serial || support?.bluetooth || support?.usb),
    connected: state === "connected",
    rawCanSupported: Boolean(capabilities?.rawCan),
    nativeBridge: Boolean(capabilities?.programming),
    flashAuthorized: operator.authorized.includes("FLASH_ECU"),
    datasetsImported: datasetCount,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Settings, Roles & Capabilities</h1>
        <p className="text-sm text-muted-foreground">
          Units, presentation and who is operating this workstation. High-risk actions stay locked until you authorise
          them here.
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Cog className="size-4 text-signal" /> Presentation</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">
            Units
            <select
              value={settings.units}
              onChange={(event) => patchSettings({ units: event.target.value as AppSettings["units"] })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="metric">Metric (km/h, °C, kPa)</option>
              <option value="imperial">Imperial (mph, °F, psi)</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Theme
            <select
              value={settings.theme}
              onChange={(event) => patchSettings({ theme: event.target.value as AppSettings["theme"] })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="technical-dark">Technical dark</option>
              <option value="light">Light</option>
              <option value="night">Night (low glare)</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Language
            <input
              value={settings.language}
              onChange={(event) => patchSettings({ language: event.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Time zone
            <input
              value={settings.timeZone}
              onChange={(event) => patchSettings({ timeZone: event.target.value })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Date format
            <select
              value={settings.dateFormat}
              onChange={(event) => patchSettings({ dateFormat: event.target.value as AppSettings["dateFormat"] })}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="locale">Locale</option>
              <option value="iso">ISO 8601</option>
            </select>
          </label>
          <label className="flex items-end gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => patchSettings({ reducedMotion: event.target.checked })}
            />
            Reduce motion
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Unit conversion applies to measured values only. An unavailable value is never converted into a number.
        </p>
      </section>

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-signal" /> Operator & permissions</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Operator name
            <input
              value={operator.name}
              onChange={(event) => {
                const next = { ...operator, name: event.target.value };
                setOperator(next);
                saveOperator(next);
              }}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Role
            <select
              value={operator.role}
              onChange={(event) => setRole(event.target.value as Operator["role"])}
              className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((permission) => {
            const permitted = ROLE_PERMISSIONS[operator.role].includes(permission);
            const status = permissionState(operator, permission);
            const highRisk = HIGH_RISK_PERMISSIONS.includes(permission);
            return (
              <li key={permission} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="readout text-xs">{permission}</span>
                {highRisk && permitted ? (
                  <button
                    onClick={() => void toggleAuthorization(permission)}
                    className="readout rounded border border-border px-2 py-1 text-[10px] hover:bg-muted"
                  >
                    {status === "GRANTED" ? "AUTHORISED — revoke" : "AUTHORIZATION REQUIRED — authorise"}
                  </button>
                ) : (
                  <Badge variant={status === "GRANTED" ? "secondary" : "outline"} className="readout text-[10px]">
                    {status}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold">Feature availability</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Determined from this browser, the connected adapter and your authorisations — not from a marketing list.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Feature availability for the current browser, adapter and role</caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="py-2">Feature</th>
                <th scope="col" className="py-2">Status</th>
                <th scope="col" className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.feature} className="border-t border-border/60">
                  <td className="py-2 pr-4">{row.feature}</td>
                  <td className="py-2 pr-4">
                    <Badge
                      variant={row.label === "AVAILABLE" || row.label === "WRITE SUPPORTED" ? "secondary" : "outline"}
                      className="readout text-[10px]"
                    >
                      {row.label}
                    </Badge>
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
