import { describe, expect, test } from "vitest";
import { decodeDtcBytes, extractPayload, hasPositiveModeResponse, isNegative, parseBatchResponse, parseDtcResponse, parseHexBytes, parseVin } from "./elm327";
import { parseFlowControl, reassembleIsoTp } from "./isotp";
import { parseObfcmResponse } from "./obfcm";
import { parseUdsResponse } from "./uds";

describe("ELM327 response parsing", () => {
  test("extracts a requested Mode 01 payload", () => {
    expect(extractPayload("41 0C 1A F8", 1, "0C")).toEqual([0x1a, 0xf8]);
  });

  test("ignores adapter error text", () => {
    expect(parseHexBytes("SEARCHING...\nNO DATA")).toEqual([]);
    expect(extractPayload("CAN ERROR", 1, "0C")).toBeNull();
    expect(isNegative("7F 31 22")).toBe(true);
  });

  test("decodes two-byte DTC values", () => {
    expect(decodeDtcBytes([0x01, 0x71, 0xc1, 0x00])).toEqual(["P0171", "U0100"]);
  });

  test("accepts an exact CAN DTC count byte", () => {
    expect(parseDtcResponse("43 02 01 71 C1 00", 3)).toEqual(["P0171", "U0100"]);
  });

  test("rejects malformed odd-length DTC payloads", () => {
    expect(parseDtcResponse("43 02 71 FF", 3)).toEqual([]);
  });

  test("parses a complete multi-PID reply", () => {
    expect(parseBatchResponse("41 0C 1A F8 0D 28", { "0C": 2, "0D": 1 })).toEqual({
      "0C": [0x1a, 0xf8],
      "0D": [0x28],
    });
  });

  test("does not invent a VIN from absent or ambiguous data", () => {
    expect(parseVin("NO DATA")).toBeNull();
    const duplicate = "49 02 01 31 48 47 43 4D 38 32 36 33 33 41 30 30 34 33 35 32";
    expect(parseVin(`${duplicate}\n${duplicate}`)).toBeNull();
  });

  test("requires the real positive service response before reporting a clear", () => {
    expect(hasPositiveModeResponse("44", 4)).toBe(true);
    expect(hasPositiveModeResponse("OK", 4)).toBe(false);
    expect(hasPositiveModeResponse("7F 04 22", 4)).toBe(false);
  });

  test("reassembles ISO-TP and rejects a broken sequence", () => {
    expect(reassembleIsoTp([[0x10, 0x09, 1, 2, 3, 4, 5, 6], [0x21, 7, 8, 9]])).toEqual({
      payload: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      frameCount: 2,
    });
    expect(() => reassembleIsoTp([[0x10, 0x09, 1, 2, 3, 4, 5, 6], [0x22, 7, 8, 9]])).toThrow("INVALID ISO-TP FRAME");
    expect(parseFlowControl([0x30, 8, 10])).toEqual({ status: 0, blockSize: 8, stMinMs: 10 });
  });

  test("parses UDS negative responses without treating them as success", () => {
    expect(parseUdsResponse([0x7f, 0x22, 0x31])).toMatchObject({
      positive: false,
      requestService: 0x22,
      negativeResponseCode: 0x31,
    });
  });

  test("requires an actual Mode 09 InfoType 17 OBFCM payload", () => {
    expect(parseObfcmResponse("49 17 01 02", "7E8", 10)).toMatchObject({ ecu: "7E8", timestamp: 10, payload: [1, 2] });
    expect(() => parseObfcmResponse("NO DATA", "7E8")).toThrow("OBFCM DATA UNAVAILABLE");
  });
});