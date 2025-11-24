import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = 'webflow-blog-session'
const SESSION_MAX_AGE = 60 * 60 * 24 // 24 hours in seconds

// Simple session token generation (for production, use a proper library like jose)
function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// In-memory session store (for production, use Redis or database)
const sessions = new Map<string, { username: string; expires: number }>()

// Clean up expired sessions periodically
function cleanExpiredSessions() {
  const now = Date.now()
  const entries = Array.from(sessions.entries())
  for (const [token, session] of entries) {
    if (session.expires < now) {
      sessions.delete(token)
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanExpiredSessions, 5 * 60 * 1000)
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const validUsername = process.env.AUTH_USERNAME
  const validPassword = process.env.AUTH_PASSWORD

  if (!validUsername || !validPassword) {
    console.error('AUTH_USERNAME and AUTH_PASSWORD environment variables must be set')
    return false
  }

  // Constant-time comparison to prevent timing attacks
  const usernameMatch = username.length === validUsername.length && 
    crypto.subtle ? await timingSafeEqual(username, validUsername) : username === validUsername
  const passwordMatch = password.length === validPassword.length && 
    crypto.subtle ? await timingSafeEqual(password, validPassword) : password === validPassword

  return usernameMatch && passwordMatch
}

// Timing-safe string comparison
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  
  if (aBytes.length !== bBytes.length) {
    return false
  }
  
  // Use subtle crypto for constant-time comparison
  const aKey = await crypto.subtle.importKey('raw', aBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bKey = await crypto.subtle.importKey('raw', bBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  
  const aSign = await crypto.subtle.sign('HMAC', aKey, new Uint8Array([1]))
  const bSign = await crypto.subtle.sign('HMAC', bKey, new Uint8Array([1]))
  
  const aArr = new Uint8Array(aSign)
  const bArr = new Uint8Array(bSign)
  
  let result = 0
  for (let i = 0; i < aArr.length; i++) {
    result |= aArr[i] ^ bArr[i]
  }
  
  return result === 0
}

export async function createSession(username: string): Promise<string> {
  cleanExpiredSessions()
  
  const token = generateSessionToken()
  const expires = Date.now() + SESSION_MAX_AGE * 1000
  
  sessions.set(token, { username, expires })
  
  return token
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

export async function getSession(): Promise<{ username: string } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  
  if (!token) {
    return null
  }
  
  const session = sessions.get(token)
  
  if (!session || session.expires < Date.now()) {
    if (session) {
      sessions.delete(token)
    }
    return null
  }
  
  return { username: session.username }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  
  if (token) {
    sessions.delete(token)
  }
  
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export function getSessionFromRequest(request: NextRequest): { username: string } | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  
  if (!token) {
    return null
  }
  
  const session = sessions.get(token)
  
  if (!session || session.expires < Date.now()) {
    if (session) {
      sessions.delete(token)
    }
    return null
  }
  
  return { username: session.username }
}

