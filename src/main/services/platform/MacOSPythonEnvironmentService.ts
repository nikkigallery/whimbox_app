import { join, dirname } from 'node:path'
import type { IPythonEnvironmentService, PythonEnvInfo, PythonEnvPaths, BackendStatus } from '../../interfaces/IPythonEnvironmentService'

import { app } from 'electron'

/**
 * macOS Python environment service.
 * Uses the `python-embedded` directory extracted to userData.
 */
export class MacOSPythonEnvironmentService implements IPythonEnvironmentService {
  resolvePaths(appDir: string): PythonEnvPaths {
    const isPackaged = app.isPackaged
    // In production, the pyinstaller binary is in Contents/MacOS/whimbox_backend
    const pythonDir = isPackaged 
      ? dirname(app.getPath('exe')) 
      : join(app.getAppPath(), 'assets')
    
    const pythonPath = join(pythonDir, 'whimbox_backend')
    return { pythonPath, pythonDir, scriptsDir: pythonDir, pathSeparator: ':' }
  }

  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv {
    const userSitePackages = join(app.getPath('userData'), 'site-packages')
    return {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: userSitePackages,
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
  }

  getInitialBackendStatus(): BackendStatus | null {
    // macOS uses an immutable bundled PyInstaller binary
    return {
      installed: true,
      version: 'bundled',
      installedAt: Date.now(),
      packageName: 'whimbox',
      entryPoint: 'whimbox',
    }
  }

  async tryFastSetup(_pythonPath: string): Promise<PythonEnvInfo | null> {
    return {
      installed: true,
      command: _pythonPath,
      version: '3.12 (PyInstaller)',
      path: _pythonPath,
      pipAvailable: false,
    }
  }

  shouldSkipLaunchInDev(): boolean {
    return true
  }
}
