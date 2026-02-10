import { Route } from 'react-router-dom'

import { Router } from 'lib/electron-router-dom'

import { MainScreen } from './screens/main'
import { OverlayScreen } from './screens/overlay'
import { StartingScreen } from './screens/starting'

export function AppRoutes() {
  return (
    <Router
      main={<Route element={<MainScreen />} path="/" />}
      overlay={<Route element={<OverlayScreen />} path="/" />}
      splash={<Route element={<StartingScreen />} path="/" />}
    />
  )
}
