// Browser stub for `fs`: narro's fs-bound paths (renderHtml, font inlining) must never run here.
const no = (name: string) => () => {
  throw new Error(`fs.${name} is unavailable in the browser`);
};
export const readFileSync = no('readFileSync');
export const readdirSync = no('readdirSync');
export const existsSync = () => false;
