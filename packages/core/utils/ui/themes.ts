export interface UITheme {
  primary: string
  secondary: string
  success: string
  warning: string
  error: string
  info: string
  muted: string
}

export const defaultTheme: UITheme = {
  primary: '#A7C6ED',
  secondary: '#B8D6F0',
  success: '#34D399', // Green
  warning: '#FBBF24', // Yellow
  error: '#EF4444', // Red
  info: '#60A5FA', // Blue
  muted: '#9CA3AF', // Gray
}


export const darkTheme: UITheme = {
  primary: '#1E3A8A', // Dark Blue
  secondary: '#1E40AF', // Medium Blue
  success: '#16A34A', // Dark Green
  warning: '#D97706', // Dark Yellow
  error: '#B91C1C', // Dark Red
  info: '#2563EB', // Dark Blue
  muted: '#4B5563', // Dark Gray
}

export const lightTheme: UITheme = {
  primary: '#3B82F6', // Light Blue
  secondary: '#60A5FA', // Lighter Blue
  success: '#10B981', // Light Green
  warning: '#F59E0B', // Light Yellow
  error: '#EF4444', // Light Red
  info: '#3B82F6', // Light Blue
  muted: '#9CA3AF', // Light Gray
}

export const getTheme = (theme: 'default' | 'dark' | 'light'): UITheme => {
  switch (theme) {
    case 'dark':
      return darkTheme
    case 'light':
      return lightTheme
    default:
      return defaultTheme
  }
}