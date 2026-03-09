import { decrypt, encrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function run() {
  const enc = await encrypt("hello world", "pass");
  console.log("Original Base64 Length:", enc.length);
  
  // What if GitHub adds a trailing newline? 
  const withNewline = enc + "\n";
  console.log("With newline Length:", withNewline.length);

  try {
     const dec = await decrypt(withNewline, "pass");
     console.log("Decrypted with trailing newline:", dec);
  } catch(e) {
     console.error("FAIL with trailing newline", e);
  }

  // What if there are multiple newlines in the string due to base64 chunking?
  // Let's create a really long encrypted string
  const longText = "A".repeat(5000);
  const encLong = await encrypt(longText, "pass");
  
  // Add newlines arbitrarily
  const brokenBase64 = encLong.slice(0, 100) + "\n" + encLong.slice(100);
  try {
     const decLong = await decrypt(brokenBase64, "pass");
     console.log("Decrypted with embedded newline:", decLong.length);
  } catch(e) {
     console.error("FAIL with embedded newline", e);
  }
}
run();
