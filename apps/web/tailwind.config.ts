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
        // All three map to Inter now; kept as separate tokens so existing
        // `font-heading` / `font-body` usages keep working.
        heading: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        body: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'var(--background)',
        'background-secondary': 'var(--background-secondary)',
        'background-tertiary': 'var(--background-tertiary)',
        foreground: 'var(--foreground)',
        'foreground-secondary': 'var(--foreground-secondary)',
        'foreground-tertiary': 'var(--foreground-tertiary)',
        border: 'var(--border)',
        surface: 'var(--surface)',
        accent: 'var(--accent)',
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
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        accent: 'var(--shadow-accent)',
        indigo: 'var(--shadow-indigo)',
        glow: 'var(--shadow-glow)',
      },
      maxWidth: {
        container: 'var(--container)',
      },
      animation: {
        'fade-in': 'fade-in 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
        'fade-in-scale': 'fade-in-scale 0.3s cubic-bezier(0.22,1,0.36,1) forwards',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
