export const UDS_SERVICES = {
  diagnosticSessionControl: 0x10,
  ecuReset: 0x11,
  readDataByIdentifier: 0x22,
  securityAccess: 0x27,
  writeDataByIdentifier: 0x2e,
  routineControl: 0x31,
  requestDownload: 0x34,
  transferData: 0x36,
  requestTransferExit: 0x37,
} as const;

export interface UdsResponse {
  positive: boolean;
  service: number;
  requestService?: number;
  negativeResponseCode?: number;
  payload: number[];
}

export function parseUdsResponse(bytes: number[]): UdsResponse {
  const service = bytes[0];
  if (service == null) throw new Error("UDS ERROR: empty response");
  if (service === 0x7f) {
    if (bytes.length < 3) throw new Error("UDS ERROR: malformed negative response");
    return {
      positive: false,
      service,
      requestService: bytes[1] as number,
      negativeResponseCode: bytes[2] as number,
      payload: bytes.slice(3),
    };
  }
  if (service < 0x40) throw new Error("UDS ERROR: invalid positive response service");
  return { positive: true, service, requestService: service - 0x40, payload: bytes.slice(1) };
}

export function isProgrammingService(service: number) {
  return [0x27, 0x2e, 0x31, 0x34, 0x36, 0x37].includes(service);
}