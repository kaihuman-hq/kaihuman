/** Base64 of raw bytes. Chunked: `String.fromCharCode(...bytes)` overflows the stack at 10 MB. */
export function bytesToBase64(bytes: Uint8Array): string {
  // A multiple of 3, so no chunk but the last needs padding.
  const CHUNK = 0x6000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
