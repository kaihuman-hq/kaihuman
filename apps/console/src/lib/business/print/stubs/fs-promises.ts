export const readFile = async (file: string): Promise<never> => {
  throw new Error(`fs/promises.readFile(${file}) is unavailable in the browser`);
};
