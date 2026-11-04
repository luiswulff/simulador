/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#faf6ee',
          100: '#f3ebdc',
          200: '#e8d9b9',
          300: '#d6bd8a',
          400: '#c2a062',
          500: '#a98445',
          600: '#8d6b32',
          700: '#735628',
          800: '#5b4421',
          900: '#47361c',
          950: '#2a1f10',
        },
        ink: {
          50: '#f7f4ee',
          100: '#ece7dd',
          200: '#ddd6c9',
          300: '#bfb6a6',
          400: '#9a9183',
          500: '#7a7266',
          600: '#5f584e',
          700: '#48433b',
          800: '#33302a',
          900: '#24221e',
          950: '#171512',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(60, 45, 20, 0.04), 0 4px 16px rgba(60, 45, 20, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
