import { passwordStore } from '@kaihuman/core';
import { beforeEach, describe, expect, it } from 'vitest';

describe('passwordStore.loadFromStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    passwordStore._encryptedStored = {};
  });

  it('moves passwords saved under the key used before the rename', () => {
    localStorage.setItem('lifosy_saved_passwords', JSON.stringify({ 'o/r:a.enc': 'blob' }));

    passwordStore.loadFromStorage();

    expect(localStorage.getItem('lifosy_saved_passwords')).toBeNull();
    expect(JSON.parse(localStorage.getItem('kaihuman_saved_passwords') ?? '')).toEqual({
      'o/r:a.enc': 'blob',
    });
    expect(passwordStore._encryptedStored).toEqual({ 'o/r:a.enc': 'blob' });
  });

  it('keeps passwords already under the new key over old ones', () => {
    localStorage.setItem('lifosy_saved_passwords', JSON.stringify({ 'o/r:a.enc': 'old' }));
    localStorage.setItem('kaihuman_saved_passwords', JSON.stringify({ 'o/r:a.enc': 'new' }));

    passwordStore.loadFromStorage();

    expect(localStorage.getItem('lifosy_saved_passwords')).toBeNull();
    expect(passwordStore._encryptedStored).toEqual({ 'o/r:a.enc': 'new' });
  });
});
