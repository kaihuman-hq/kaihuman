import { decrypt, encrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function run() {
  try {
    const enc = await encrypt("", "password");
    console.log("Encrypted empty string:", enc);
    const decodedHex = atob(enc);
    console.log("Decoded hex:", decodedHex);
    console.log("Parts lengths:", decodedHex.split(':').map(p => p.length));
    
    const dec = await decrypt(enc, "password");
    console.log("Success! Decrypted:", dec);
  } catch(e) {
    console.error("FAIL:", e);
  }
}
run();
