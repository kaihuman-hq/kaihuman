/**
 * Web Crypto API utilities for AES-GCM encryption/decryption
 */

// Helper to derive a key from a password
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();

  // Import the password as key material
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey'],
  );

  // Derive the AES-GCM key using PBKDF2
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// Convert ArrayBuffer to Hex String
function bufferToHex(buffer: ArrayBuffer): string {
  const byteArr = new Uint8Array(buffer);
  let hexString = '';
  for (let i = 0; i < byteArr.length; i++) {
    const hex = byteArr[i]!.toString(16);
    hexString += hex.length === 1 ? '0' + hex : hex;
  }
  return hexString;
}

// Convert Hex String to Uint8Array
function hexToBuffer(hexString: string): Uint8Array {
  if (hexString.length % 2 !== 0) throw new Error('Invalid hex string');
  const buffer = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    buffer[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
  }
  return buffer;
}

/**
 * Encrypts a plain text string using a password.
 * Returns a hex string representation of the form:
 * `salt:iv:ciphertext`
 */
export async function encrypt(text: string, password: string): Promise<string> {
  const enc = new TextEncoder();

  // Generate random salt and IV
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(password, salt);

  const cipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    enc.encode(text),
  );

  const saltHex = bufferToHex(salt.buffer);
  const ivHex = bufferToHex(iv.buffer);
  const cipherHex = bufferToHex(cipherBuffer);

  const rawHex = `${saltHex}:${ivHex}:${cipherHex}`;

  // Base64 encode the string to prevent transmission truncation or formatting issues
  // in GitHub text files / JSON stringification.
  return btoa(rawHex);
}

/**
 * Decrypts a cipher text string (format `salt:iv:ciphertext` or base64) using a password.
 * Returns the decrypted plain text string.
 */
export async function decrypt(encryptedHex: string, password: string): Promise<string> {
  let cleanedStr = encryptedHex.trim();

  // If there are no colons, assume it is base64 encoded (the new standard).
  // If there are colons, it is the old fallback raw hex format.
  if (!cleanedStr.includes(':')) {
    try {
      cleanedStr = atob(cleanedStr);
    } catch (_e) {
      throw new Error('Invalid encrypted format. Expected base64 or salt:iv:ciphertext.');
    }
  }

  const parts = cleanedStr.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted format. The file is corrupted, empty, or not encrypted. Expected salt:iv:ciphertext.',
    );
  }

  const salt = hexToBuffer(parts[0] as string);
  const iv = hexToBuffer(parts[1] as string);
  const cipherText = hexToBuffer(parts[2] as string);

  const key = await deriveKey(password, salt);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    cipherText.buffer as ArrayBuffer,
  );

  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}
