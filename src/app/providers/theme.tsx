import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
type Theme = 'light' | 'dark'
const Context = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('repacircle-theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem('repacircle-theme', theme)
    } catch {
      /* Theme still works when storage is unavailable. */
    }
  }, [theme])
  return (
    <Context.Provider
      value={{ theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }}
    >
      {children}
    </Context.Provider>
  )
}
export const useTheme = () => useContext(Context)
