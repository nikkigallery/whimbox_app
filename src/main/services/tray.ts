import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { join } from 'node:path'

let tray: Tray | null = null

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'assets', 'tray', 'icon.ico')
  }

  return join(app.getAppPath(), 'src', 'resources', 'build', 'icons', 'icon.ico')
}

export function createTray(mainWindow: BrowserWindow) {
  if (tray) return

  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    const fallback = nativeImage.createEmpty()
    tray = new Tray(fallback)
  } else {
    tray = new Tray(icon)
  }

  tray.setToolTip(app.name || '奇想盒')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示奇想盒',
        click: () => {
          if (mainWindow.isDestroyed()) return
          mainWindow.show()
          mainWindow.focus()
        },
      },
      {
        label: '关闭奇想盒',
        click: () => {
          app.quit()
        },
      },
    ])
  )

  tray.on('click', () => {
    if (mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
  })

  tray.on('double-click', () => {
    if (mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
  })
}

export function getTray(): Tray | null {
  return tray
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
