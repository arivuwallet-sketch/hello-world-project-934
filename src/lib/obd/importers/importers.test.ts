import { describe, expect, it } from "vitest";
import { parseDbc } from "./dbc";
import { parseObdbSignalSet } from "./obdb";
import { parseTorqueCsv } from "./torque";
import { parseEvPidFile } from "./iternio";
import { decodeCanFrame, parseMonitorLine } from "../can-decode";

const DBC = `
VERSION ""

BO_ 466 ENGINE_DATA: 8 XXX
 SG_ ENGINE_RPM : 0|16@1+ (0.25,0) [0|8000] "rpm" XXX
 SG_ COOLANT_TEMP : 16|8@1+ (1,-40) [-40|215] "degC" XXX
 SG_ WEIRD : notanumber "x" XXX

BO_ 180 SPEED: 8 XXX
 SG_ WHEEL_SPEED : 0|16@1+ (0.01,0) [0|300] "kph" XXX
`;

describe("opendbc DBC import", () => {
  it("reads messages and signals and skips unparseable lines instead of guessing", () => {
    const result = parseDbc(DBC);
    expect(result.messages).toBe(2);
    expect(result.signals).toHaveLength(3);
    expect(result.skipped.length).toBeGreaterThan(0);
    const rpm = result.signals.find((signal) => signal.name === "ENGINE_RPM");
    expect(rpm?.canId).toBe(466);
    expect(rpm?.scale).toBe(0.25);
    expect(result.signals.find((signal) => signal.name === "COOLANT_TEMP")?.offset).toBe(-40);
  });

  it("refuses a file with no decodable signals", () => {
    expect(() => parseDbc("VERSION \"\"\n")).toThrow();
  });
});

describe("CAN frame decoding", () => {
  const dataset = {
    provenance: {
      sourceName: "commaai/opendbc",
      sourceUrl: "https://github.com/commaai/opendbc",
      license: "MIT",
      importedAt: "2026-01-01T00:00:00.000Z",
      classification: "MANUFACTURER-SPECIFIC" as const,
    },
    signals: parseDbc(DBC).signals,
  };

  it("decodes a matching frame using the imported scaling", () => {
    // 0x1F40 little-endian = 8000 raw -> 8000 * 0.25 = 2000 rpm
    const decoded = decodeCanFrame(466, [0x40, 0x1f, 90, 0, 0, 0, 0, 0], [dataset]);
    const rpm = decoded.find((signal) => signal.name === "ENGINE_RPM");
    expect(rpm?.value).toBeCloseTo(2000, 5);
    expect(rpm?.license).toBe("MIT");
    expect(decoded.find((signal) => signal.name === "COOLANT_TEMP")?.value).toBe(50);
  });

  it("returns nothing when no imported definition covers the frame", () => {
    expect(decodeCanFrame(0x123, [1, 2, 3, 4, 5, 6, 7, 8], [dataset])).toEqual([]);
  });

  it("flags a value outside the declared range instead of hiding it", () => {
    const decoded = decodeCanFrame(180, [0xff, 0xff, 0, 0, 0, 0, 0, 0], [dataset]);
    expect(decoded[0]?.outOfRange).toBe(true);
  });

  it("parses monitor lines and rejects malformed ones", () => {
    expect(parseMonitorLine("7E8 03 41 0C 1A")).toEqual({ canId: 0x7e8, payload: [3, 0x41, 0x0c, 0x1a] });
    expect(parseMonitorLine("BUFFER FULL")).toBeNull();
    expect(parseMonitorLine("")).toBeNull();
  });
});

describe("OBDb signal set import", () => {
  const json = JSON.stringify({
    commands: [
      {
        hdr: "7E0",
        cmd: { "01": "0C" },
        signals: [{ id: "ENGINE_RPM", name: "Engine RPM", fmt: { bix: 0, len: 16, div: 4, unit: "revolutionsPerMinute", max: 8000 } }],
      },
      {
        hdr: "7E0",
        cmd: { "01": "05" },
        signals: [{ id: "COOLANT", name: "Coolant", fmt: { bix: 0, len: 8, add: -40, unit: "celsius" } }],
      },
      {
        hdr: "7E0",
        cmd: { "01": "1F" },
        signals: [{ id: "PACKED", name: "Packed bits", fmt: { bix: 3, len: 4, unit: "percent" } }],
      },
    ],
  });

  it("converts recognised layouts and reports the rest", () => {
    const result = parseObdbSignalSet(json, { make: "Toyota" });
    expect(result.signals).toHaveLength(2);
    expect(result.unconvertible.some((note) => note.includes("PACKED"))).toBe(true);
    const rpm = result.signals.find((signal) => signal.id === "engine_rpm");
    expect(rpm?.unit).toBe("rpm");
    expect(rpm?.formula).toEqual({ operation: "uint16", highByte: 0, lowByte: 1, divisor: 4, offset: 0 });
    expect(rpm?.vehicle?.make).toBe("Toyota");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseObdbSignalSet("{oops")).toThrow();
  });
});

describe("Torque CSV import (MG ZS EV style)", () => {
  const csv = [
    "Name,ShortName,ModeAndPID,Equation,Min Value,Max Value,Units,Header",
    "Battery SoC,SoC,229A,((A*256)+B)/10,0,100,%,7E4",
    "Cell 1 Voltage,C1,22B001,A*0.02,0,5,V,7E4",
    "Pack Current,I,22B002,(A*256+B)*0.1-3200,-500,500,A,7E4",
    "Odd One,X,22B003,exp(A)*log(B),0,1,x,7E4",
  ].join("\n");

  it("imports rows whose equation maps to a declarative formula", () => {
    const result = parseTorqueCsv(csv, { make: "MG", model: "ZS EV" });
    expect(result.signals.map((signal) => signal.name)).toContain("Battery SoC");
    const soc = result.signals.find((signal) => signal.name === "Battery SoC");
    expect(soc?.mode).toBe(0x22);
    expect(soc?.pid).toBe("9A");
    expect(soc?.ecu).toBe("7E4");
    expect(soc?.vehicle?.model).toBe("ZS EV");
  });

  it("leaves out an equation it would have to execute", () => {
    const result = parseTorqueCsv(csv);
    expect(result.signals.some((signal) => signal.name === "Odd One")).toBe(false);
    expect(result.unconvertible.some((note) => note.includes("Odd One"))).toBe(true);
  });

  it("refuses a file without the required columns", () => {
    expect(() => parseTorqueCsv("a,b\n1,2")).toThrow();
  });
});

describe("EV PID file import", () => {
  it("detects the Torque CSV shape", () => {
    const csv = "Name,ModeAndPID,Equation,Units\nSoC,229A,A/2,%";
    const result = parseEvPidFile(csv, "hyundai.csv");
    expect(result.detectedFormat).toBe("torque-csv");
    expect(result.signals).toHaveLength(1);
  });

  it("detects the OBDb JSON shape", () => {
    const json = JSON.stringify({
      commands: [{ hdr: "7E4", cmd: { "22": "B001" }, signals: [{ id: "SOC", name: "SoC", fmt: { bix: 0, len: 8, div: 2, unit: "percent" } }] }],
    });
    const result = parseEvPidFile(json, "kia.json");
    expect(result.detectedFormat).toBe("obdb-json");
    expect(result.signals).toHaveLength(1);
  });
});
