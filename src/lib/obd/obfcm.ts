export interface ObfcmRecord {
  infoType: 0x17;
  rawResponse: string;
  ecu: string;
  timestamp: number;
  payload: number[];
  quality: "GOOD";
}

export function parseObfcmResponse(rawResponse: string, ecu: string, timestamp = Date.now()): ObfcmRecord {
  const tokens = rawResponse.match(/[0-9A-F]{2}/gi)?.map((token) => Number.parseInt(token, 16)) ?? [];
  const start = tokens.findIndex((value, index) => value === 0x49 && tokens[index + 1] === 0x17);
  if (start < 0) throw new Error("OBFCM DATA UNAVAILABLE");
  const payload = tokens.slice(start + 2);
  if (payload.length < 2) throw new Error("OBFCM DATA UNAVAILABLE");
  return { infoType: 0x17, rawResponse, ecu, timestamp, payload, quality: "GOOD" };
}