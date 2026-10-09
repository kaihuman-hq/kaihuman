/** @type {import('tailwindcss').Config} */
export default {
  presets: [require('@kaihuman/config/tailwind-preset.js')],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
