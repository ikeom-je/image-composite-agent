/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0078d7',
          light: '#00a2ed',
          dark: '#005a9e'
        },
        accent: '#ff9900',
        background: '#f5f7fa',
        card: '#ffffff',
        text: '#333333',
        border: '#e0e0e0',
        success: '#28a745',
        error: '#dc3545'
      }
    }
  },
  plugins: []
}