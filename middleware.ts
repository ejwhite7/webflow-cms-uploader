import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rate limiting: simple in-memory store (for production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30 // 30 requests per minute

function getRateLimitKey(request: NextRequest): string {
  // Use IP address for rate limiting
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return `ratelimit:${ip}`
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  
  if (!entry || entry.resetTime < now) {
    // Reset or create new entry
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW }
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now }
  }
  
  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetIn: entry.resetTime - now }
}

// Clean up old rate limit entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    const entries = Array.from(rateLimitStore.entries())
    for (const [key, entry] of entries) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Check rate limiting for API routes
  if (pathname.startsWith('/api/')) {
    const rateLimitKey = getRateLimitKey(request)
    const { allowed, remaining, resetIn } = checkRateLimit(rateLimitKey)
    
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(resetIn / 1000)),
            'Retry-After': String(Math.ceil(resetIn / 1000)),
          }
        }
      )
    }
    
    // Add rate limit headers to response
    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Remaining', String(remaining))
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)))
    
    // Check authentication for protected API routes
    if (pathname === '/api/publish' || pathname === '/api/config') {
      const sessionCookie = request.cookies.get('webflow-blog-session')
      
      if (!sessionCookie?.value) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
      
      // Note: Full session validation happens in the API route
      // Middleware just checks for presence of cookie
    }
    
    return response
  }
  
  // Protect main app pages (except login)
  if (pathname === '/' || pathname.startsWith('/app')) {
    const sessionCookie = request.cookies.get('webflow-blog-session')
    
    if (!sessionCookie?.value) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }
  
  // Allow login page
  if (pathname === '/login') {
    const sessionCookie = request.cookies.get('webflow-blog-session')
    
    // If already logged in, redirect to home
    if (sessionCookie?.value) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

