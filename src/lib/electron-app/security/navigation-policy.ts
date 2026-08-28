import type { Session, WebContents } from 'electron'

const externallyManagedNavigationSessions = new WeakSet<Session>()

export function registerExternallyManagedNavigationSession(session: Session) {
  externallyManagedNavigationSessions.add(session)
}

export function isExternallyManagedNavigation(contents: WebContents) {
  return externallyManagedNavigationSessions.has(contents.session)
}
