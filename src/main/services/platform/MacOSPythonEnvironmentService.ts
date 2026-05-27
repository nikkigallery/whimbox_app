import { join } from 'node:path'
import type { IPythonEnvironmentService, PythonEnvInfo, PythonEnvPaths, BackendStatus } from '../../interfaces/IPythonEnvironmentService'

/**
 * macOS Python environment service.
 * Uses the bundled `python-embedded` directory, mirroring the Windows
 * distribution model (embedded Python + pip install wheel at runtime).
 */
export class MacOSPythonEnvironmentService implements IPythonEnvironmentService {
  resolvePaths(appDir: string): PythonEnvPaths {
    const pythonDir = join(appDir, 'python-embedded')
    const scriptsDir = join(pythonDir, 'bin')
    const pythonPath = join(scriptsDir, 'python3')
    return { pythonPath, pythonDir, scriptsDir, pathSeparator: ':' }
  }

  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv {
    const env = {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: '',
      PATH: `${paths.pythonDir}${paths.pathSeparator}${paths.scriptsDir}${paths.pathSeparator}${process.env.PATH ?? ''}`,
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
    }
    delete env.PYTHONHOME
    return env
  }

  getInitialBackendStatus(): BackendStatus | null {
    // TODO: implement macOS-specific backend status detection when macOS support lands
    return null
  }

  async tryFastSetup(_pythonPath: string): Promise<PythonEnvInfo | null> {
    // TODO: implement macOS-specific fast setup when macOS support lands
    return null
  }
}
