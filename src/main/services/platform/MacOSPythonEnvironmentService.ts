import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import type { IPythonEnvironmentService, PythonEnvInfo, PythonEnvPaths, BackendStatus } from '../../interfaces/IPythonEnvironmentService'

/**
 * macOS Python environment service.
 * Supports running from a local dev venv when running in dev mode,
 * and falls back to bundled embedded Python in production.
 */
export class MacOSPythonEnvironmentService implements IPythonEnvironmentService {
  resolvePaths(appDir: string): PythonEnvPaths {
    const devVenvDir = '/Users/Mercury/Downloads/Whimbox/.venv'
    if (!app.isPackaged && existsSync(devVenvDir)) {
      const pythonDir = devVenvDir
      const scriptsDir = join(pythonDir, 'bin')
      const pythonPath = join(scriptsDir, 'python')
      return { pythonPath, pythonDir, scriptsDir, pathSeparator: ':' }
    }

    const pythonDir = join(appDir, 'python-embedded')
    const scriptsDir = join(pythonDir, 'bin')
    const pythonPath = join(scriptsDir, 'python3')
    return { pythonPath, pythonDir, scriptsDir, pathSeparator: ':' }
  }

  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: !app.isPackaged ? '/Users/Mercury/Downloads/Whimbox' : '',
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
    delete env.PYTHONHOME
    return env
  }

  getInitialBackendStatus(): BackendStatus | null {
    return null
  }

  async tryFastSetup(_pythonPath: string): Promise<PythonEnvInfo | null> {
    return null
  }

  shouldSkipLaunchInDev(): boolean {
    return false
  }

  getSpawnCwd(): string | null {
    return !app.isPackaged ? '/Users/Mercury/Downloads/Whimbox' : null
  }
}
