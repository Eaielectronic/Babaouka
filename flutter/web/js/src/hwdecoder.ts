// Video decoding through the browser's own decoders (WebCodecs): hardware on iPad / iPhone / most
// laptops, instead of the software WebAssembly VP9 decoder. Decoded VideoFrames are handed to Flutter
// untouched, so pixels never go through JavaScript.

export const hwCodecs = { h264: false, vp9: false };

type Kind = "h264" | "vp9";

const H264_PROBE = { codec: "avc1.640028", codedWidth: 1920, codedHeight: 1080 };
const VP9_PROBE = { codec: "vp09.00.10.08", codedWidth: 1920, codedHeight: 1080 };

export async function detectHwCodecs(): Promise<void> {
  const g = globalThis as any;
  const VD = g.VideoDecoder;
  if (!VD || !g.EncodedVideoChunk || typeof VD.isConfigSupported !== "function") return;
  try {
    hwCodecs.h264 = !!(await VD.isConfigSupported(H264_PROBE)).supported;
  } catch (e) {
    hwCodecs.h264 = false;
  }
  try {
    hwCodecs.vp9 = !!(await VD.isConfigSupported(VP9_PROBE)).supported;
  } catch (e) {
    hwCodecs.vp9 = false;
  }
  console.log("WebCodecs decoders: h264=" + hwCodecs.h264 + " vp9=" + hwCodecs.vp9);
}

// Split an Annex B stream (00 00 01 / 00 00 00 01 start codes) into NAL units.
function splitAnnexB(data: Uint8Array): Uint8Array[] {
  const nals: Uint8Array[] = [];
  const n = data.length;
  let start = -1;
  let i = 0;
  const push = (from: number, to: number) => {
    while (to > from && data[to - 1] === 0) to--;
    if (to > from) nals.push(data.subarray(from, to));
  };
  while (i + 2 < n) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      if (start >= 0) push(start, i);
      start = i + 3;
      i += 3;
    } else {
      i++;
    }
  }
  if (start >= 0) push(start, n);
  return nals;
}

function buildAvcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const out = new Uint8Array(11 + sps.length + pps.length);
  let o = 0;
  out[o++] = 1;
  out[o++] = sps[1];
  out[o++] = sps[2];
  out[o++] = sps[3];
  out[o++] = 0xff;
  out[o++] = 0xe1;
  out[o++] = sps.length >> 8;
  out[o++] = sps.length & 0xff;
  out.set(sps, o);
  o += sps.length;
  out[o++] = 1;
  out[o++] = pps.length >> 8;
  out[o++] = pps.length & 0xff;
  out.set(pps, o);
  return out;
}

function hex2(v: number): string {
  return (v < 16 ? "0" : "") + v.toString(16);
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class HwVideoDecoder {
  private dec: any;
  private configured = false;
  private gotKey = false;
  private seq = 0;
  private sps: Uint8Array | undefined;
  private pps: Uint8Array | undefined;

  constructor(
    private kind: Kind,
    private onFrame: (frame: any) => void,
    private onFatal: (reason: string) => void
  ) {}

  get queueSize(): number {
    return this.dec ? this.dec.decodeQueueSize || 0 : 0;
  }

  private ensureDecoder(): any {
    if (this.dec && this.dec.state !== "closed") return this.dec;
    const VD = (globalThis as any).VideoDecoder;
    this.configured = false;
    this.gotKey = false;
    this.dec = new VD({
      output: (frame: any) => this.onFrame(frame),
      error: (e: any) => {
        this.dec = undefined;
        this.configured = false;
        this.gotKey = false;
        this.onFatal(String(e));
      },
    });
    return this.dec;
  }

  // Returns false when the data could not be queued (e.g. waiting for the first key frame).
  decode(data: Uint8Array, key: boolean, _pts: number): boolean {
    try {
      return this.kind === "h264" ? this.decodeH264(data, key) : this.decodeVp9(data, key);
    } catch (e) {
      this.close();
      this.onFatal(String(e));
      return false;
    }
  }

  private submit(bytes: Uint8Array, isKey: boolean) {
    const EVC = (globalThis as any).EncodedVideoChunk;
    this.dec.decode(
      new EVC({ type: isKey ? "key" : "delta", timestamp: this.seq++ * 1000, data: bytes })
    );
  }

  private decodeVp9(data: Uint8Array, key: boolean): boolean {
    const dec = this.ensureDecoder();
    if (!this.configured) {
      dec.configure({ codec: "vp09.00.10.08", optimizeForLatency: true });
      this.configured = true;
    }
    if (key) this.gotKey = true;
    if (!this.gotKey) return false;
    this.submit(data, key);
    return true;
  }

  private decodeH264(data: Uint8Array, key: boolean): boolean {
    const nals = splitAnnexB(data);
    if (!nals.length) return false;
    let sps: Uint8Array | undefined;
    let pps: Uint8Array | undefined;
    let isKey = key;
    const body: Uint8Array[] = [];
    let size = 0;
    for (const nal of nals) {
      const type = nal[0] & 0x1f;
      if (type === 7) sps = nal;
      else if (type === 8) pps = nal;
      else if (type === 9) continue;
      else {
        if (type === 5) isKey = true;
        body.push(nal);
        size += 4 + nal.length;
      }
    }
    if (sps && pps && sps.length >= 4 && (!sameBytes(this.sps, sps) || !sameBytes(this.pps, pps))) {
      const dec = this.ensureDecoder();
      dec.configure({
        codec: "avc1." + hex2(sps[1]) + hex2(sps[2]) + hex2(sps[3]),
        description: buildAvcC(sps, pps),
        optimizeForLatency: true,
      });
      this.sps = sps.slice();
      this.pps = pps.slice();
      this.configured = true;
      this.gotKey = false;
    }
    if (!this.configured || !body.length) return false;
    if (isKey) this.gotKey = true;
    if (!this.gotKey) return false;
    const out = new Uint8Array(size);
    let o = 0;
    for (const nal of body) {
      out[o++] = (nal.length >>> 24) & 0xff;
      out[o++] = (nal.length >>> 16) & 0xff;
      out[o++] = (nal.length >>> 8) & 0xff;
      out[o++] = nal.length & 0xff;
      out.set(nal, o);
      o += nal.length;
    }
    this.submit(out, isKey);
    return true;
  }

  close() {
    try {
      if (this.dec && this.dec.state !== "closed") this.dec.close();
    } catch (e) {
      // already closed
    }
    this.dec = undefined;
    this.configured = false;
    this.gotKey = false;
    this.sps = undefined;
    this.pps = undefined;
  }
}
