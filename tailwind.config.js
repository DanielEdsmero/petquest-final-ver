/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        nunito: ['Nunito', 'sans-serif'],
      },
      colors: {
        deep: '#06061a',
        void: '#09092b',
        card: '#0e0e2e',
        card2: '#13133a',
        border: '#1e1e4a',
        gold: '#f5a31a',
        'gold-light': '#ffd166',
        arcane: '#7c3aed',
        teal: '#06b6d4',
        rose: '#f43f5e',
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'slide-in': 'slideIn 0.4s ease-out',
        'fade-up': 'fadeUp 0.6s ease-out',
        sparkle: 'sparkle 1.5s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        sparkle: {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
          '50%': { transform: 'scale(1.2) rotate(180deg)', opacity: '0.7' },
        }
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(245, 163, 26, 0.4), 0 0 40px rgba(245, 163, 26, 0.2)',
        'glow-arcane': '0 0 20px rgba(124, 58, 237, 0.4), 0 0 40px rgba(124, 58, 237, 0.2)',
        'glow-teal': '0 0 20px rgba(6, 182, 212, 0.4), 0 0 40px rgba(6, 182, 212, 0.2)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
      }
    },
  },
  plugins: [],
}
