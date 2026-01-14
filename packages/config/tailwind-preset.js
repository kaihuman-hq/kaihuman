/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Nexus Theme Colors
        nexus: {
          bg: '#0a0a0f',       // Deep black/blue background
          panel: '#13131f',    // Slightly lighter panel bg
          border: '#2a2a35',   // Subtle border
          primary: '#00f0ff',  // Cyberpunk Cyan
          secondary: '#7000ff',// Deep Purple
          accent: '#ff003c',   // Cyberpunk Red
          text: '#e0e0e0',
          muted: '#858595',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
