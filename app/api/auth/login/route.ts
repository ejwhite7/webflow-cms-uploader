import { NextRequest, NextResponse } from 'next/server'
import { validateCredentials, createSession, setSessionCookie } from '@/lib/auth'

// Maximum login attempts per IP per hour
const loginAttempts = new Map<string, { count: number; resetTime: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown'
}

function checkLoginAttempts(ip: string): { allowed: boolean; remainingAttempts: number } {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  
  if (!entry || entry.resetTime < now) {
    loginAttempts.set(ip, { count: 0, resetTime: now + LOCKOUT_DURATION })
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS }
  }
  
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    return { allowed: false, remainingAttempts: 0 }
  }
  
  return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS - entry.count }
}

function recordLoginAttempt(ip: string): void {
  const entry = loginAttempts.get(ip)
  if (entry) {
    entry.count++
  }
}

function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip)
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request)
    
    // Check for too many login attempts
    const { allowed, remainingAttempts } = checkLoginAttempts(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }
    
    const body = await request.json()
    const { username, password } = body
    
    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }
    
    // Validate input length to prevent DoS
    if (username.length > 100 || password.length > 100) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
    
    // Validate credentials
    const isValid = await validateCredentials(username, password)
    
    if (!isValid) {
      recordLoginAttempt(ip)
      return NextResponse.json(
        { error: `Invalid credentials. ${remainingAttempts - 1} attempts remaining.` },
        { status: 401 }
      )
    }
    
    // Clear login attempts on successful login
    clearLoginAttempts(ip)
    
    // Create session
    const token = await createSession(username)
    await setSessionCookie(token)
    
    return NextResponse.json({
      success: true,
      message: 'Login successful',
    })
    
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    )
  }
}

