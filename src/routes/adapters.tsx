import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Bluetooth, CheckCircle2, Usb, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";

export const Route = createFileRoute("/adapters")({
  head: () => ({
    meta: [
      { title: "Compatible OBD Adapters — TorqueDeck" },
      {
        name: "description",
        content:
          "Known-good USB and true-BLE ELM327/STN OBD-II adapters for browser diagnostics, and why classic Bluetooth SPP dongles can never connect.",
      },
      { property: "og:title", content: "Compatible OBD Adapters — TorqueDeck" },
      {
        property: "og:description",
        content: "Which OBD-II adapters work in the browser — USB serial and true BLE only.",
      },
    ],
  }),
  component: AdaptersPage,
});

const USB = [
  { name: "OBDLink SX (STN1130)", note: "Best all-round wired adapter. Fast, full CAN support." },
  { name: "OBDLink EX", note: "Tuned for Forscan/ISO-TP heavy work; excellent stability." },
  { name: "ScanTool 427201 USB", note: "Genuine STN chipset, reliable at 115200 baud." },
  { name: "Genuine ELM327 v1.5 USB (FTDI/CH340)", note: "Works well; avoid v2.1 clone firmware." },
  { name: "Vgate iCar Pro USB", note: "Budget wired option, 38400 baud default." },
];

const BLE = [
  { name: "OBDLink CX (BLE)", note: "True BLE GATT UART — the most reliable wireless option." },
  { name: "Vgate iCar Pro BLE 4.0", note: "Exposes FFE0 UART service; pairs from Chrome." },
  { name: "LELink 2 BLE", note: "BLE-only design, works with Web Bluetooth." },
  { name: "vLinker FD/MC BLE", note: "Use the BLE variant, not the Bluetooth 3.0 model." },
];

const INCOMPATIBLE = [
  "Any ELM327 marked 'Bluetooth 3.0 / 4.0 dual' that pairs with a PIN (0000 / 1234)",
  "Classic Bluetooth SPP clones sold as 'Mini ELM327 v2.1'",
  "Wi-Fi ELM327 dongles (they expose a raw TCP socket browsers cannot open)",
];

function AdaptersPage() {
  const { supportedSerial, supportedBluetooth, connect, state } = useObd();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-wide">Compatible adapters</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          TorqueDeck talks to your car through the browser. That limits it to two kinds of
          interface: USB-wired serial adapters and true Bluetooth Low Energy dongles.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Usb className="size-5 text-signal" />
            <h2 className="font-display font-semibold tracking-wide">USB serial — recommended</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Web Serial {supportedSerial ? "is available in this browser." : "is not available — use Chrome, Edge or Opera on desktop."}
          </p>
          <ul className="mt-4 space-y-3">
            {USB.map((a) => (
              <li key={a.name} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" />
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.note}</div>
                </div>
              </li>
            ))}
          </ul>
          <Button
            className="mt-5 w-full"
            disabled={!supportedSerial || state === "connecting"}
            onClick={() => void connect("serial")}
          >
            Connect USB adapter
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Bluetooth className="size-5 text-signal" />
            <h2 className="font-display font-semibold tracking-wide">True BLE dongles</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Web Bluetooth {supportedBluetooth ? "is available in this browser." : "is not available in this browser."}
          </p>
          <ul className="mt-4 space-y-3">
            {BLE.map((a) => (
              <li key={a.name} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" />
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.note}</div>
                </div>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            className="mt-5 w-full"
            disabled={!supportedBluetooth || state === "connecting"}
            onClick={() => void connect("bluetooth")}
          >
            Connect BLE adapter
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-danger" />
          <h2 className="font-display font-semibold tracking-wide">
            These will never work — don&apos;t buy them for this
          </h2>
        </div>
        <ul className="mt-3 space-y-2">
          {INCOMPATIBLE.map((t) => (
            <li key={t} className="flex gap-2 text-sm text-muted-foreground">
              <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Classic Bluetooth (SPP) is a serial profile no browser can open. If the dongle asks for a
          pairing code in your operating system&apos;s Bluetooth settings, it is classic Bluetooth
          and is unreachable here. Look for &quot;BLE&quot; or &quot;Bluetooth Low Energy&quot; on
          the box.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        <h2 className="font-display font-semibold tracking-wide text-foreground">
          Vehicle coverage
        </h2>
        <p className="mt-3">
          Standard OBD-II diagnostics — live data, stored and pending fault codes, freeze frame,
          readiness monitors, Mode 06 test results and VIN — work across any OBD-II compliant
          vehicle, including all major Indian brands such as Maruti Suzuki, Tata, Mahindra, Hyundai,
          Kia, Honda, Toyota and Renault.
        </p>
        <p className="mt-2">
          Proprietary module scans, coding, security access and actuator routines require verified
          service data and compatible factory/pass-thru hardware for the exact model. TorqueDeck does
          not substitute guessed commands for that manufacturer coverage.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">

        <h2 className="font-display font-semibold tracking-wide text-foreground">
          Getting a clean connection
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Ignition on, engine running or in position II — not fully off.</li>
          <li>Plug the adapter into the OBD-II port and wait for its power LED.</li>
          <li>Press Connect and pick the adapter&apos;s port in the browser dialog.</li>
          <li>Protocol detection runs automatically (ELM327 ATSP0 auto mode).</li>
          <li>If detection fails, unplug for five seconds and retry — cheap clones need it.</li>
        </ol>
      </div>
    </div>
  );
}
