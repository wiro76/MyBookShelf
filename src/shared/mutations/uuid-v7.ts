export interface UuidV7Options {
  now?: () => number;
  random?: (bytes: Uint8Array) => Uint8Array | void;
}

export function createUuidV7(options: UuidV7Options = {}): string {
  const timestamp = Math.trunc((options.now ?? Date.now)());
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 2 ** 48) {
    throw new RangeError("UUID_V7_TIMESTAMP_INVALID");
  }
  const bytes = new Uint8Array(16);
  if (options.random) {
    const generated = options.random(bytes);
    if (generated && generated !== bytes) bytes.set(generated);
  } else {
    globalThis.crypto.getRandomValues(bytes);
  }
  let remaining = timestamp;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
