/** Brand tokens live as CSS variables in src/theme/tokens.css; Tailwind maps onto them. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { 950: v('forest-950'), 900: v('forest-900'), 800: v('forest-800'), 700: v('forest-700'), 600: v('forest-600') },
        gold: { 400: v('gold-400'), 500: v('gold-500'), 600: v('gold-600') },
        sage: { 50: v('sage-50'), 100: v('sage-100'), 200: v('sage-200'), 300: v('sage-300') },
        cream: v('cream'),
        ink: v('ink'),
        muted: v('muted'),
        danger: v('danger'),
        amber: v('amber'),
        ok: v('ok'),
      },
      fontFamily: {
        display: ['"Archivo Narrow"', '"Archivo"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: 'var(--radius-card)', pill: '999px', cell: 'var(--radius-cell)' },
      boxShadow: { card: 'var(--shadow-card)', lift: 'var(--shadow-lift)', ring: '0 0 0 3px rgb(var(--gold-500) / 0.45)' },
    },
  },
  plugins: [],
}
