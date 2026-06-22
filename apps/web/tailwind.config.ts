import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-syne)', 'system-ui', 'sans-serif'],
        body: ['var(--font-space)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Courier New', 'monospace'],
        sans: ['var(--font-space)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'var(--background)',
        'background-secondary': 'var(--background-secondary)',
        foreground: 'var(--foreground)',
        'foreground-secondary': 'var(--foreground-secondary)',
        border: 'var(--border)',
        surface: 'var(--surface)',
        indigo: {
          DEFAULT: 'var(--indigo)',
          light: 'var(--indigo-light)',
          dark: 'var(--indigo-dark)',
        },
        cyan: {
          DEFAULT: 'var(--cyan)',
          light: 'var(--cyan-light)',
        },
      },
      backgroundImage: {
        'gradient-brand': 'var(--gradient-brand)',
        'gradient-subtle': 'var(--gradient-subtle)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        indigo: 'var(--shadow-indigo)',
        glow: 'var(--shadow-glow)',
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease forwards',
        'fade-in-scale': 'fade-in-scale 0.3s ease forwards',
        'gradient-x': 'gradient-x 4s ease infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
