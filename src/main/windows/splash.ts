import { join } from 'node:path'

import { createWindow } from 'lib/electron-app/factories/windows/create'
import { displayName } from '~/package.json'

/** 启动中窗口：用于展示 Python 环境检测/准备等耗时操作进度 */
export async function SplashWindow() {
  const window = createWindow({
    id: 'splash',
    title: displayName,
    width: 360,
    height: 240,
    resizable: false,
    frame: false,
    show: true,
    center: true,
    transparent: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  return window
}
