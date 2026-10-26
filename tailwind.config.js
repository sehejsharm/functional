/** Brand tokens live as CSS variables in src/theme/tokens.css; Tailwind maps onto them. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { 950: v('forest-950'), 900: v('forest-900'), 800: v('forest-800'), 700: v('forest-700'), 600: v('forest-600'), 100: v('forest-100'), 50: v('forest-50') },
        gold: { 50: v('gold-50'), 300: v('gold-300'), 400: v('gold-400'), 500: v('gold-500'), 600: v('gold-600'), 700: v('gold-700') },
        sage: { 50: v('sage-50'), 100: v('sage-100'), 200: v('sage-200'), 300: v('sage-300') },
        canvas: v('canvas'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        cream: v('cream'),
        ink: { DEFAULT: v('ink'), 2: v('ink-2') },
        muted: v('muted'),
        danger: v('danger'),
        amber: v('amber'),
        ok: v('ok'),
        info: v('info'),
      },
      fontFamily: {
        display: ['"Archivo Narrow"', '"Archivo"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: { '2xs': ['11px', '16px'] },
      borderRadius: { card: 'var(--radius-card)', pill: '999px', cell: 'var(--radius-cell)' },
      boxShadow: {
        card: 'var(--shadow-card)', pop: 'var(--shadow-pop)', lift: 'var(--shadow-lift)',
        ring: '0 0 0 3px rgb(var(--forest-600) / 0.25)', 'ring-gold': '0 0 0 3px rgb(var(--gold-500) / 0.45)',
      },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } } },
      animation: { shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
}
