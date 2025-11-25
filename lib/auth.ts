import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const SESSION_COOKIE_NAME = 'webflow-blog-session'
const SESSION_MAX_AGE = 60 * 60 * 24 // 24 hours in seconds

// Get secret key from env or generate a stable one
function getSecretKey(): string {
  // Use AUTH_PASSWORD as part of the secret for signing
  // This ensures tokens are invalidated if the password changes
  const secret = process.env.AUTH_PASSWORD || 'default-secret-key'
  return secret + '-webflow-blog-session-key'
}

// Simple token generation with signature
async function createToken(username: string): Promise<string> {
  const expires = Date.now() + SESSION_MAX_AGE * 1000
  const payload = JSON.stringify({ username, expires })
  const signature = await sign(payload)
  // Base64 encode payload and signature
  const token = btoa(payload) + '.' + signature
  return token
}

// Verify and decode token
async function verifyToken(token: string): Promise<{ username: string; expires: number } | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    
    const payload = atob(parts[0])
    const signature = parts[1]
    
    // Verify signature
    const expectedSignature = await sign(payload)
    if (signature !== expectedSignature) {
      return null
    }
    
    const data = JSON.parse(payload)
    
    // Check expiry
    if (data.expires < Date.now()) {
      return null
    }
    
    return data
  } catch {
    return null
  }
}

// Create HMAC signature
async function sign(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(getSecretKey())
  const messageData = encoder.encode(data)
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData)
  const signatureArray = new Uint8Array(signature)
  return Array.from(signatureArray, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const validUsername = process.env.AUTH_USERNAME
  const validPassword = process.env.AUTH_PASSWORD

  if (!validUsername || !validPassword) {
    console.error('AUTH_USERNAME and AUTH_PASSWORD environment variables must be set')
    return false
  }

  // Simple comparison (the timing-safe comparison was causing issues)
  return username === validUsername && password === validPassword
}

export async function createSession(username: string): Promise<string> {
  return await createToken(username)
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
  
  const session = await verifyToken(token)
  return session ? { username: session.username } : null
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function getSessionFromRequest(request: NextRequest): Promise<{ username: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  
  if (!token) {
    return null
  }
  
  const session = await verifyToken(token)
  return session ? { username: session.username } : null
}
