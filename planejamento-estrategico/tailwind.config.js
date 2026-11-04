/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#f0f5fa',
          100: '#dce7f3',
          200: '#bccfe6',
          300: '#8eadd3',
          400: '#5d86bb',
          500: '#3d68a3',
          600: '#2e5288',
          700: '#27436f',
          800: '#1e3a5f',
          900: '#1b2f4c',
          950: '#111d30',
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
