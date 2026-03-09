import { encrypt, decrypt } from './packages/core/src/utils/crypto.ts';
import { webcrypto } from 'crypto';
globalThis.window = { crypto: webcrypto as any };

async function run() {
  try {
    const pwd1 = 'secret123';
    const pwd2 = 'wrongpassword';
    
    // Encrypt some text
    const encrypted = await encrypt('my secret data', pwd1);
    console.log('Encrypted text:', encrypted);
    
    // Attempt decrypt
    console.log('Attempting decrypt with wrong password...');
    const decrypted = await decrypt(encrypted, pwd2);
    console.log('SUCCESS! DECRYPTED CONTENT IS:', decrypted, typeof decrypted);
  } catch (err: any) {
    console.error('FAILED TO DECRYPT:', err.message);
  }
}

run();
