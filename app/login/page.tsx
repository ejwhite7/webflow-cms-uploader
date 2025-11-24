'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      // Redirect to the original page or home
      const redirect = searchParams.get('redirect') || '/'
      router.push(redirect)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center geometric-pattern">
      <div className="w-full max-w-md px-6">
        <div className="glass rounded-3xl p-8 glow-electric">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric-500 to-purple-600 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-white text-center mb-2">
            Webflow Blog Publisher
          </h1>
          <p className="text-zinc-500 text-sm text-center mb-8">
            Sign in to access the publisher
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-coral-500/10 border border-coral-500/30">
              <p className="text-coral-400 text-sm text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-xs text-zinc-500 mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-midnight-800 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-electric-500/50 focus:border-electric-500 transition-all"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs text-zinc-500 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-midnight-800 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-electric-500/50 focus:border-electric-500 transition-all"
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`
                w-full py-3 rounded-xl font-medium transition-all duration-300
                ${isLoading
                  ? 'bg-midnight-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-electric-500 to-purple-600 text-white hover:shadow-lg hover:shadow-electric-500/25 hover:scale-[1.02] active:scale-[0.98]'
                }
              `}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          Protected access only
        </p>
      </div>
    </main>
  )
}

function LoginFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center geometric-pattern">
      <div className="w-full max-w-md px-6">
        <div className="glass rounded-3xl p-8 glow-electric">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-electric-500 to-purple-600 flex items-center justify-center animate-pulse">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <div className="h-8 bg-midnight-700 rounded animate-pulse mb-4"></div>
            <div className="h-4 bg-midnight-700 rounded animate-pulse w-2/3 mx-auto"></div>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}

