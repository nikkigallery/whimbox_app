/**
 * Abstraction for platform-specific Python environment configuration.
 * Covers embedded Python paths, environment variables, and setup flow.
 */
export interface PythonEnvPaths {
  /** Absolute path to the Python interpreter binary. */
  pythonPath: string
  /** Directory containing the Python interpreter. */
  pythonDir: string
  /** Directory containing pip/scripts (Scripts on Windows, bin on macOS). */
  scriptsDir: string
  /** PATH-separator character for this platform. */
  pathSeparator: string
}

export interface IPythonEnvironmentService {
  /**
   * Resolve Python interpreter paths for the current platform.
   * @param appDir  The resolved application root directory.
   */
  resolvePaths(appDir: string): PythonEnvPaths

  /**
   * Build the process environment for spawning the Python backend.
   * @param paths   Result of resolvePaths().
   */
  buildEnv(paths: PythonEnvPaths): NodeJS.ProcessEnv

  /**
   * Return backend status for this platform.
   * On macOS the backend is assumed pre-installed (venv-based);
   * on Windows it is installed via the whl installer flow.
   */
  getInitialBackendStatus(): BackendStatus | null

  /**
   * Short-circuit setupEmbeddedPython when the backend is pre-installed
   * (e.g., macOS dev venv). Returns a resolved PythonEnvInfo or null to
   * proceed with the normal Windows setup flow.
   */
  tryFastSetup(pythonPath: string): Promise<PythonEnvInfo | null>
}

// Re-export types used by the interface (defined here to avoid circular deps)
export type BackendStatus = {
  installed: boolean
  version: string
  installedAt: number
  packageName: string
  entryPoint: string
}

export type PythonEnvInfo = {
  installed: boolean
  command?: string
  version?: string
  path?: string
  pipAvailable?: boolean
  message?: string
}
