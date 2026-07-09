import { Route } from 'react-router-dom'

import { Router } from 'lib/electron-router-dom'

import { MainScreen } from './screens/main'
import { MapMaskOverlayScreen } from './screens/map-mask-overlay'
import { OverlayScreen } from './screens/overlay'
import { StartingScreen } from './screens/starting'
import { VideoOverlayScreen } from './screens/video-overlay'

export function AppRoutes() {
  return (
    <Router
      {...{
        main: <Route element={<MainScreen />} path="/" />,
        overlay: <Route element={<OverlayScreen />} path="/" />,
        'video-overlay': <Route element={<VideoOverlayScreen />} path="/" />,
        'map-mask-overlay': <Route element={<MapMaskOverlayScreen />} path="/" />,
        splash: <Route element={<StartingScreen />} path="/" />,
      }}
    />
  )
}
