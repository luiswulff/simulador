/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#f0f7f4',
          100: '#dbeee5',
          200: '#b9ddcd',
          300: '#8cc4ae',
          400: '#5da58b',
          500: '#3d8970',
          600: '#2c6e5a',
          700: '#245849',
          800: '#1f473c',
          900: '#1b3b32',
          950: '#0d211c',
        },
        ink: {
          50: '#f6f6f4',
          100: '#e8e8e4',
          200: '#d1d1ca',
          300: '#b1b1a7',
          400: '#8a8a80',
          500: '#6f6f65',
          600: '#585850',
          700: '#484842',
          800: '#3c3c37',
          900: '#343430',
          950: '#1a1a17',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
