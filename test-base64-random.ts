import { decrypt, encrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function run() {
  console.log("Empty string decode:", Buffer.from('').toString('base64')); // empty
  try {
     const dec = await decrypt("", "pass");
  } catch(e) {
     console.log("Empty string Error:", e.message);
  }

  // Normal text that contains no colons but is valid b64 characters
  const plaintext = "ThisIsSomeRandomTextWithoutColons123==";
  try {
    const raw = atob(plaintext);
    console.log("atob worked on plaintext:", raw);
    console.log("Includes colon:", raw.includes(':'));
    console.log("Split parts length:", raw.split(':').length);
    const dec2 = await decrypt(plaintext, "pass");
  } catch(e) {
    console.log("Plaintext Error:", e.message);
  }
}
run();
