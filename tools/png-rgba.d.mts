export interface DecodedPng {
  width: number;
  height: number;
  data: Uint8Array;
}

export function readPngRgba(path: string): DecodedPng;
