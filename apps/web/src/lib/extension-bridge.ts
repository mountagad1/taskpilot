// Notifies the TaskPilot browser extension (if installed) about auth
// state changes, via chrome.runtime.sendMessage to its externally_connectable
// listener. No-ops silently when the extension isn't installed or the
// browser doesn't expose the chrome.runtime API.

interface ChromeRuntimeLike {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback?: (response: unknown) => void
  ) => void
}

function getExtensionRuntime(): ChromeRuntimeLike | undefined {
  if (typeof window === 'undefined') return undefined
  const chromeGlobal = (window as unknown as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome
  return chromeGlobal?.runtime
}

export function notifyExtensionSignedIn(session: {
  userId: string
  email: string
  authToken: string
  plan?: 'free' | 'pro' | 'enterprise'
}) {
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
  const runtime = getExtensionRuntime()
  if (!extensionId || !runtime) return

  try {
    runtime.sendMessage(extensionId, {
      type: 'AUTH_SUCCESS',
      payload: {
        user_id: session.userId,
        email: session.email,
        auth_token: session.authToken,
        plan: session.plan,
      },
    })
  } catch {
    // Extension not installed — safe to ignore.
  }
}

export function notifyExtensionSignedOut() {
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
  const runtime = getExtensionRuntime()
  if (!extensionId || !runtime) return

  try {
    runtime.sendMessage(extensionId, { type: 'AUTH_SIGNOUT' })
  } catch {
    // Extension not installed — safe to ignore.
  }
}
