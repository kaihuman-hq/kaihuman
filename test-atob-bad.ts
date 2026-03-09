try {
  const bad = "Not a base64 string because it has spaces and no padding";
  console.log("Decoding bad...", atob(bad));
} catch(e) {
  console.log("atob threw error:", e.message);
}

try {
  // Try decrypting something that is NOT valid AES-GCM format
  // but IS valid base64
  const fakeB64 = btoa('just-some-random-text-no-colons');
  console.log("Fake B64:", fakeB64);
  console.log("Decoded Fake B64:", atob(fakeB64));
  
  // Now run it through crypto.ts decrypt logic
  import { decrypt } from './packages/core/src/utils/crypto.ts';
  import { webcrypto } from 'crypto';
  globalThis.window = { crypto: webcrypto as any };

  console.log("Trying to decrypt fake base64...");
  await decrypt(fakeB64, "password");
} catch(e) {
  console.log("decrypt threw error:", e.message);
}
