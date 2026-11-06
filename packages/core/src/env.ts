/**
 * Vite injects `import.meta.env`; other bundlers (Metro for the mobile app) leave it undefined,
 * so reading a key off it directly crashes at module load.
 */
export function viteEnv(meta: { env?: Partial<ImportMetaEnv> }): Partial<ImportMetaEnv> {
  return meta.env ?? {};
}
