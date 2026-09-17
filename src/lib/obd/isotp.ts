export interface IsoTpMessage {
  payload: number[];
  frameCount: number;
}

export function reassembleIsoTp(frames: number[][]): IsoTpMessage {
  const first = frames[0];
  if (!first?.length) throw new Error("INVALID ISO-TP FRAME");
  const pci = first[0] as number;
  const type = pci >> 4;
  if (type === 0) {
    const length = pci & 0x0f;
    if (length > first.length - 1) throw new Error("INVALID ISO-TP FRAME");
    return { payload: first.slice(1, 1 + length), frameCount: 1 };
  }
  if (type !== 1 || first.length < 2) throw new Error("INVALID ISO-TP FRAME");
  const length = ((pci & 0x0f) << 8) | (first[1] as number);
  if (length <= 7 || length > 4095) throw new Error("INVALID ISO-TP FRAME");
  const payload = first.slice(2);
  let sequence = 1;
  for (const frame of frames.slice(1)) {
    const framePci = frame[0];
    if (framePci == null || framePci >> 4 !== 2 || (framePci & 0x0f) !== sequence % 16) {
      throw new Error("INVALID ISO-TP FRAME");
    }
    payload.push(...frame.slice(1));
    sequence += 1;
    if (payload.length >= length) break;
  }
  if (payload.length < length) throw new Error("ISO-TP ERROR: incomplete payload");
  return { payload: payload.slice(0, length), frameCount: sequence };
}

export function parseFlowControl(frame: number[]) {
  if (!frame.length || frame[0] >> 4 !== 3 || frame.length < 3) {
    throw new Error("INVALID ISO-TP FRAME");
  }
  const status = (frame[0] as number) & 0x0f;
  if (status > 2) throw new Error("INVALID ISO-TP FRAME");
  const encodedStMin = frame[2] as number;
  const stMinMs = encodedStMin <= 0x7f ? encodedStMin : encodedStMin >= 0xf1 && encodedStMin <= 0xf9 ? (encodedStMin - 0xf0) / 10 : null;
  return { status, blockSize: frame[1] as number, stMinMs };
}