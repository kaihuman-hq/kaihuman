/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../config/tailwind-preset.js')],
  content: ['./src/**/*.{ts,tsx}', './.storybook/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
