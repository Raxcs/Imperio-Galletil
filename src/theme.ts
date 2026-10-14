export const THEME = {
  colors: {
    bg: '#09090b', // Deep OLED canvas
    card: '#121215', // Minimalist elevated surface
    cardElevated: '#18181b', // Surface elevated (cards, subcards, inputs)
    cardActive: '#222226', // Active / Pressed surface
    cardBorder: 'rgba(255, 255, 255, 0.08)', // Crisp hairline border
    cardBorderSubtle: 'rgba(255, 255, 255, 0.04)',
    cardBorderHighlight: 'rgba(255, 255, 255, 0.14)', // Elevated card / sheet top border
    
    textPrimary: '#f4f4f5', // Crisp high-contrast zinc-100
    textSecondary: '#d4d4d8', // Secondary zinc-300 (readable in all light conditions)
    textMuted: '#a1a1aa', // Muted zinc-400
    
    accent: '#f59e0b', // Amber-500
    accentLight: '#fbbf24', // Amber-400
    accentDark: '#78350f', // Amber-900
    accentBg: 'rgba(245, 158, 11, 0.12)', // Subtle amber pill background
    accentText: '#fbbf24',
    
    success: '#10b981', // Emerald-500
    successBg: 'rgba(16, 185, 129, 0.12)',
    
    danger: '#ef4444',
    dangerBg: 'rgba(239, 68, 68, 0.15)',
  },
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    sheet: 28,
    full: 9999,
  },
};
