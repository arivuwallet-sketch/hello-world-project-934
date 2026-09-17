import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useObd } from "@/lib/obd/store";
import { TEST_CATALOG, evaluateTest, passHasEvidence, type DiagnosticTestResult } from "@/lib/obd/diagnostic-tests";
export const Route = createFileRoute("/diagnostic-tests")({ head: () => ({ meta: [
  { title: "Automated Diagnostic Tests | Vehicle Insight Hub" }, { name: "description", content: "Evidence-based checks for hardware, transport, protocols, OBD, PIDs, DTCs, VIN, EV, tuning and performance." },
  { property: "og:title", content: "Automated Diagnostic Tests | Vehicle Insight Hub" }, { property: "og:description", content: "A test passes only when actual evidence is attached." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
] }), component: DiagnosticTestsPage });
function DiagnosticTestsPage() {
  const obd = useObd(); const [results,setResults]=useState<DiagnosticTestResult[]>([]);
  const run = () => {
    const lastRx=[...obd.logEntries].reverse().find(e=>e.dir==="rx"); const lastTx=[...obd.logEntries].reverse().find(e=>e.dir==="tx");
    const latency=lastRx&&lastTx&&lastRx.ts>=lastTx.ts?lastRx.ts-lastTx.ts:null;
    const context={connected:obd.state==="connected",adapterIdentity:obd.elm.adapterVersion||null,protocol:obd.protocolCode?`${obd.protocolCode} ${obd.protocolName}`:null,realResponse:lastRx?.text??null,latencyMs:latency};
    const next=TEST_CATALOG.map(t=>evaluateTest(t,context)); setResults(next);
  };
  return <div className="space-y-6"><header><h1 className="text-2xl font-bold">Automated Diagnostic Test Center</h1><p className="text-sm text-muted-foreground">Tests inspect current real evidence. Running code alone never earns PASS.</p></header>
    <section className="panel flex items-center gap-3 p-4"><Button disabled={obd.state!=="connected"} onClick={run}><FlaskConical className="mr-2 size-4"/>Run evidence tests</Button><Badge variant="secondary" className="readout text-[10px]">{obd.state==="connected"?"REAL ADAPTER CONNECTED":"OBD ADAPTER NOT CONNECTED"}</Badge></section>
    <section className="panel overflow-x-auto p-5"><table className="w-full text-xs"><thead className="text-muted-foreground"><tr><th className="text-left">Category</th><th className="text-left">Test</th><th className="text-left">Result</th><th className="text-left">Start / end</th><th className="text-left">Latency</th><th className="text-left">Evidence / source</th></tr></thead><tbody>{TEST_CATALOG.map(test=>{const r=results.find(x=>x.id===test.id);return <tr key={test.id} className="border-t border-border/50"><td className="py-2">{test.category}</td><td>{test.name}</td><td className="readout">{r?.result??"NOT RUN"}</td><td className="readout">{r?`${new Date(r.startedAt).toLocaleTimeString()} / ${new Date(r.endedAt).toLocaleTimeString()}`:"—"}</td><td className="readout">{r?.latencyMs==null?"DATA UNAVAILABLE":`${r.latencyMs} ms`}</td><td>{r?<>{r.evidence.join(" · ")||"NO EVIDENCE"}<span className="text-muted-foreground"> · {r.source}</span>{!passHasEvidence(r)&&<strong className="text-destructive"> INVALID PASS</strong>}</>:test.source}</td></tr>})}</tbody></table></section>
  </div>;
}