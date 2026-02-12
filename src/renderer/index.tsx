import ReactDom from 'react-dom/client'
import React from 'react'

import { ThemeProvider } from './components/theme-provider'
import { AppRoutes } from './routes'

import './globals.css'

ReactDom.createRoot(document.querySelector('app') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppRoutes />
    </ThemeProvider>
  </React.StrictMode>
)
