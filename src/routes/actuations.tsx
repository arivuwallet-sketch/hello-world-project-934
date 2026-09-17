import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Send, ShieldAlert, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OfflineNotice } from "@/components/obd/ConnectionBar";
import { useObd } from "@/lib/obd/store";
import { isNegative } from "@/lib/obd/elm327";
import { MAKE_PROFILES, profileForMake, type MakeProfile } from "@/lib/obd/actuations";

export const Route = createFileRoute("/actuations")({
  head: () => ({
    meta: [
      { title: "Documented Actuation Console — TorqueDeck" },
      { name: "description", content: "Send documented manufacturer diagnostic requests and inspect the vehicle controller's unmodified response." },
      { property: "og:title", content: "Documented Actuation Console — TorqueDeck" },
      { property: "og:description", content: "A guarded console for verified vehicle-specific diagnostic requests without guessed routines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActuationsPage,
});

const REQUEST_PATTERN = /^(?:AT[0-9A-Z ]{1,30}|[0-9A-F]{2,8192})$/;

function ActuationsPage() {
  const { vehicles, activeVehicleId, sendRaw, state } = useObd();
  const active = vehicles.find((vehicle) => vehicle.id === activeVehicleId);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [header, setHeader] = useState("");
  const [request, setRequest] = useState("");
  const [source, setSource] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");

  const profile: MakeProfile = useMemo(() => {
    if (overrideId) return MAKE_PROFILES.find((item) => item.id === overrideId) ?? profileForMake("");
    return profileForMake(active?.make ?? "");
  }, [active?.make, overrideId]);

  const run = async () => {
    if (state !== "connected") {
      toast.error("Connect an adapter first");
      return;
    }
    const cleanHeader = header.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    const cleanRequest = request.replace(/\s+/g, "").toUpperCase();
    if (!/^(?:[0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{8})$/.test(cleanHeader)) {
      toast.error("Enter the documented ECU header");
      return;
    }
    if (!REQUEST_PATTERN.test(cleanRequest) || cleanRequest.startsWith("AT")) {
      toast.error("Enter a complete hexadecimal diagnostic request");
      return;
    }
    if (!source.trim()) {
      toast.error("Record the source document or reference first");
      return;
    }
    if (!confirmed) {
      toast.error("Confirm the request is verified for this exact vehicle");
      return;
    }
    setBusy(true);
    try {
      const headerReply = await sendRaw(`ATSH${cleanHeader}`);
      if (!/OK/i.test(headerReply)) throw new Error(`Adapter rejected header: ${headerReply || "no reply"}`);
      const response = await sendRaw(cleanRequest);
      if (isNegative(response)) throw new Error(`Controller rejected the request: ${response || "no reply"}`);
      setReply(response || "(empty adapter reply)");
      toast.success("Request sent — inspect the controller reply");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReply(message);
      toast.error("Request failed", { description: message });
    } finally {
      await sendRaw("ATSH7DF").catch(() => undefined);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Documented Actuation Console</h1>
        <p className="text-sm text-muted-foreground">No built-in manufacturer routine is guessed or generated.</p>
      </header>
      <OfflineNotice />

      <section className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
        <Wrench className="size-4 shrink-0 text-signal" />
        <span className="text-muted-foreground">
          Vehicle: <strong className="text-foreground">{active ? active.nickname || `${active.year} ${active.make} ${active.model}`.trim() : "not selected"}</strong>
          {" · "}Make family: <strong className="text-foreground">{profile.make}</strong>
        </span>
        <select className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-sm" value={overrideId ?? profile.id} onChange={(event) => setOverrideId(event.target.value)}>
          {MAKE_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.make}</option>)}
        </select>
      </section>

      <section className="panel flex items-start gap-3 border-warn/40 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
        <p className="text-muted-foreground">TorqueDeck has no verified proprietary routine database for {profile.make}. Obtain the exact ECU address, request bytes, preconditions and recovery procedure from manufacturer service information for the VIN.</p>
      </section>

      <section className="panel space-y-4 p-5">
        <div className="flex items-start gap-3 text-sm">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
          <p className="text-muted-foreground">A valid-looking request can move an actuator, erase learned values or damage a controller. The app sends the bytes unchanged and cannot determine whether they are safe for the connected vehicle.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={header} onChange={(event) => setHeader(event.target.value)} placeholder="Documented ECU header, e.g. 7E0" spellCheck={false} />
          <Input value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Documented request bytes" spellCheck={false} />
        </div>
        <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Source: manual title, section, revision or service reference" />
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
          I verified this address and request for this exact model, year, engine and controller.
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void run()} disabled={busy || state !== "connected" || !confirmed}>
            <Send className="size-4" /> {busy ? "Sending…" : "Send documented request"}
          </Button>
          <Button variant="outline" asChild><Link to="/expert"><ExternalLink className="size-4" /> Open full console</Link></Button>
        </div>
        <pre className="readout min-h-20 overflow-auto rounded-md border border-border bg-background p-3 text-xs">{reply || "No request sent."}</pre>
      </section>
    </div>
  );
}