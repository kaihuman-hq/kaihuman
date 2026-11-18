// narro runs `createRequire(import.meta.url)` at import time; it only resolves font files lazily.
export const createRequire = () => ({
  resolve: (id: string): never => {
    throw new Error(`require.resolve(${id}) is unavailable in the browser`);
  },
});
