/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Acento azul (estilo LinkedIn)
        accent: {
          50: '#f0f7fd',
          100: '#deeefa',
          200: '#bcdcf5',
          300: '#8ec4ec',
          400: '#57a5df',
          500: '#2e86cf',
          600: '#0a66c2',
          700: '#0a55a0',
          800: '#0d4783',
          900: '#103c6c',
          950: '#0a2647',
        },
        // Neutros frios e leves (estilo Apple)
        ink: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter',
          'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
