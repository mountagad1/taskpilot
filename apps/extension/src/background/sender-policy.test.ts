import { describe, expect, it } from 'vitest'

import type { SessionState, UiMessage } from '../shared/messages'
import { authorizeMessage, classifySender, publicSession } from './sender-policy'

const ID = 'abcdefghijklmnopabcdefghijklmnop'
const ORIGIN = `chrome-extension://${ID}/`

const popup = { id: ID, url: `${ORIGIN}popup.html` }
const sidebar = { id: ID, url: `${ORIGIN}sidebar.html`, tab: { id: 7 } }
const contentScript = { id: ID, url: 'https://evil.example/page', tab: { id: 7 } }

describe('classifySender', () => {
  it('recognises extension pages, including the sidebar iframe inside a tab', () => {
    expect(classifySender(popup, ID, ORIGIN)).toBe('extension_page')
    expect(classifySender(sidebar, ID, ORIGIN)).toBe('extension_page')
  })

  it('treats a sender in a website tab as a content script', () => {
    expect(classifySender(contentScript, ID, ORIGIN)).toBe('content_script')
  })

  it('rejects other extensions and senders with no url or tab', () => {
    expect(classifySender({ ...popup, id: 'other' }, ID, ORIGIN)).toBe('untrusted')
    expect(classifySender({ id: ID }, ID, ORIGIN)).toBe('untrusted')
  })

  it('does not accept a look-alike origin', () => {
    const lookalike = { id: ID, url: `chrome-extension://${ID}x/popup.html`, tab: undefined }
    expect(classifySender(lookalike, ID, ORIGIN)).toBe('untrusted')
  })
})

describe('authorizeMessage', () => {
  const privileged: UiMessage[] = [
    { type: 'GET_SESSION' },
    { type: 'CLEAR_SESSION' },
    { type: 'CONFIRM_STEP', runId: 'r', approved: true },
    { type: 'CANCEL_RUN', runId: 'r' },
    { type: 'INSTALL_AGENT', agentId: 'a' },
    { type: 'RUN_AGENT', agentId: 'a' },
    { type: 'GET_PAGE_CONTEXT', tabId: 3 },
    { type: 'SMART_PASTE' },
  ]

  it('lets extension pages send anything', () => {
    for (const message of privileged) {
      expect(authorizeMessage(message, 'extension_page', undefined)).toEqual({ allowed: true, message })
    }
  })

  it('blocks content scripts from reading the session, approving steps and every other privileged message', () => {
    for (const message of privileged) {
      expect(authorizeMessage(message, 'content_script', 7).allowed).toBe(false)
    }
  })

  it('lets a content script start a goal, pinned to its own tab', () => {
    const decision = authorizeMessage({ type: 'RUN_GOAL', goal: 'x', tabId: 99 }, 'content_script', 7)
    expect(decision).toEqual({ allowed: true, message: { type: 'RUN_GOAL', goal: 'x', tabId: 7 } })
  })

  it('blocks untrusted senders entirely', () => {
    expect(authorizeMessage({ type: 'RUN_GOAL', goal: 'x' }, 'untrusted', 7).allowed).toBe(false)
  })
})

describe('publicSession', () => {
  it('strips the token and reports whether one exists', () => {
    const session: SessionState = {
      session_id: 's',
      user_id: 'u',
      email: 'a@b.c',
      auth_token: 'secret-token',
      plan: 'pro',
      fingerprint: 'f',
    }
    const view = publicSession(session)
    expect(view).not.toHaveProperty('auth_token')
    expect(JSON.stringify(view)).not.toContain('secret-token')
    expect(view.signed_in).toBe(true)
    expect(view.email).toBe('a@b.c')
    expect(publicSession({ session_id: 's', plan: 'free', fingerprint: 'f' }).signed_in).toBe(false)
  })
})
