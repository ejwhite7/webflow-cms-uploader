'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import matter from 'gray-matter'
import { marked } from 'marked'
import { sanitizeHtml } from '@/lib/sanitize'

interface BlogMetadata {
  title?: string
  description?: string
  keywords?: {
    primary?: string
    secondary?: string[]
    tertiary?: string[]
  }
  author?: string
  date?: string
  canonical_url?: string
  featured_image?: string
  featured_image_alt?: string
  word_count?: number
  reading_time?: string
  slug?: string
}

interface ParsedBlog {
  metadata: BlogMetadata
  content: string
  htmlContent: string
}

interface EnvConfig {
  siteId: string
  collectionId: string
  hasApiToken: boolean
}

type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error'

export default function Home() {
  const router = useRouter()
  const [parsedBlog, setParsedBlog] = useState<ParsedBlog | null>(null)
  const [status, setStatus] = useState<SubmissionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [successData, setSuccessData] = useState<{ id: string; slug: string } | null>(null)
  const [envConfigured, setEnvConfigured] = useState<EnvConfig | null>(null)
  const [username, setUsername] = useState<string>('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  
  // Webflow configuration
  const [siteId, setSiteId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [showConfig, setShowConfig] = useState(true)
  const [useEnvCredentials, setUseEnvCredentials] = useState(true)

  // Fetch env config and auth status on mount
  useEffect(() => {
    // Check auth status
    fetch('/api/auth/check')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setUsername(data.username)
        }
      })
      .catch(() => {
        // Auth check failed, redirect to login
        router.push('/login')
      })

    // Fetch config
    fetch('/api/config')
      .then(res => {
        if (res.status === 401) {
          router.push('/login')
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data) {
          setEnvConfigured(data)
          if (data.siteId) setSiteId(data.siteId)
          if (data.collectionId) setCollectionId(data.collectionId)
          // If env vars are configured, collapse the settings panel
          if (data.hasApiToken && data.collectionId) {
            setShowConfig(false)
          }
        }
      })
      .catch(() => {
        setEnvConfigured({ siteId: '', collectionId: '', hasApiToken: false })
      })
  }, [router])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const parseMarkdownFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      
      let frontmatter: Record<string, unknown> = {}
      let markdownContent = text
      
      // Handle the case where YAML is wrapped in code fences: ```yaml\n---\n...\n---\n```
      const codeFenceYamlMatch = text.match(/^```yaml\n---\n([\s\S]*?)\n---\n```\n?([\s\S]*)$/)
      if (codeFenceYamlMatch) {
        // Parse YAML manually from the code fence format
        const yamlContent = codeFenceYamlMatch[1]
        markdownContent = codeFenceYamlMatch[2]
        
        try {
          // Use gray-matter to parse just the YAML
          const wrappedYaml = `---\n${yamlContent}\n---\n`
          const { data } = matter(wrappedYaml)
          frontmatter = data
        } catch (err) {
          console.error('Failed to parse YAML:', err)
        }
      } else {
        // Standard frontmatter format (---\n...\n---\n)
        try {
          const { data, content } = matter(text)
          frontmatter = data
          markdownContent = content
        } catch (err) {
          console.error('Failed to parse markdown:', err)
          setErrorMessage('Failed to parse markdown file. Please check the format.')
          return
        }
      }
      
      try {
        const rawHtml = marked(markdownContent) as string
        // Sanitize HTML to prevent XSS attacks in preview
        const htmlContent = sanitizeHtml(rawHtml)
        
        setParsedBlog({
          metadata: frontmatter as BlogMetadata,
          content: markdownContent,
          htmlContent,
        })
        setStatus('idle')
        setErrorMessage('')
        setSuccessData(null)
      } catch (err) {
        console.error('Failed to convert markdown:', err)
        setErrorMessage('Failed to convert markdown to HTML.')
      }
    }
    reader.readAsText(file)
  }, [])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      parseMarkdownFile(acceptedFiles[0])
    }
  }, [parseMarkdownFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md'],
      'text/plain': ['.txt', '.md'],
    },
    multiple: false,
  })

  const handleSubmit = async () => {
    if (!parsedBlog) return
    
    const usingEnv = useEnvCredentials && envConfigured?.hasApiToken
    
    if (!usingEnv && (!siteId || !collectionId || !apiToken)) {
      setErrorMessage('Please configure your Webflow API settings or set environment variables')
      return
    }

    setStatus('submitting')
    setErrorMessage('')

    try {
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: parsedBlog.metadata,
          content: parsedBlog.htmlContent,
          siteId: usingEnv ? undefined : siteId,
          collectionId: usingEnv ? undefined : collectionId,
          apiToken: usingEnv ? undefined : apiToken,
          useEnvCredentials: usingEnv,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to publish to Webflow')
      }

      setStatus('success')
      setSuccessData(data)
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'An unknown error occurred')
    }
  }

  const resetUpload = () => {
    setParsedBlog(null)
    setStatus('idle')
    setErrorMessage('')
    setSuccessData(null)
  }

  return (
    <main className="min-h-screen geometric-pattern">
      {/* Header */}
      <header className="border-b border-white/5 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-electric-500 to-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Webflow Blog Publisher</h1>
              <p className="text-xs text-zinc-500">Markdown to CMS in seconds</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {username && (
              <span className="text-xs text-zinc-500">
                Signed in as <span className="text-zinc-300">{username}</span>
              </span>
            )}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-coral-400 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {isLoggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Configuration Panel */}
        {showConfig && (
          <div className="mb-8 glass rounded-2xl p-6 glow-electric animate-in slide-in-from-top-4 duration-500">
            <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-electric-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Webflow API Configuration
            </h2>

            {/* Environment Variables Status */}
            {envConfigured && (
              <div className="mb-6 p-4 rounded-xl bg-midnight-800/50 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${envConfigured.hasApiToken ? 'bg-green-500' : 'bg-zinc-600'}`} />
                    <span className="text-sm text-zinc-300">
                      {envConfigured.hasApiToken 
                        ? 'Environment variables configured' 
                        : 'No environment variables found'}
                    </span>
                  </div>
                  {envConfigured.hasApiToken && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-zinc-500">Use env vars</span>
                      <button
                        onClick={() => setUseEnvCredentials(!useEnvCredentials)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          useEnvCredentials ? 'bg-electric-500' : 'bg-midnight-700'
                        }`}
                      >
                        <span 
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            useEnvCredentials ? 'left-5' : 'left-0.5'
                          }`} 
                        />
                      </button>
                    </label>
                  )}
                </div>
                {envConfigured.hasApiToken && (
                  <div className="mt-3 flex gap-4 text-xs text-zinc-500">
                    <span>API Token: <code className="text-green-400">••••••••</code></span>
                    {envConfigured.siteId && (
                      <span>Site ID: <code className="text-green-400">{envConfigured.siteId.slice(0, 8)}...</code></span>
                    )}
                    {envConfigured.collectionId && (
                      <span>Collection: <code className="text-green-400">{envConfigured.collectionId.slice(0, 8)}...</code></span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manual input fields - show when not using env vars or env vars not configured */}
            {(!envConfigured?.hasApiToken || !useEnvCredentials) && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">API Token</label>
                    <input
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="Enter your API token"
                      className="w-full px-4 py-2.5 bg-midnight-800 border border-white/10 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-electric-500/50 focus:border-electric-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Site ID</label>
                    <input
                      type="text"
                      value={siteId}
                      onChange={(e) => setSiteId(e.target.value)}
                      placeholder="e.g., 580e63e98c9a982ac9b8b741"
                      className="w-full px-4 py-2.5 bg-midnight-800 border border-white/10 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-electric-500/50 focus:border-electric-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1.5">Collection ID</label>
                    <input
                      type="text"
                      value={collectionId}
                      onChange={(e) => setCollectionId(e.target.value)}
                      placeholder="e.g., 580e64008c9a982ac9b8b778"
                      className="w-full px-4 py-2.5 bg-midnight-800 border border-white/10 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-electric-500/50 focus:border-electric-500 transition-all"
                    />
                  </div>
                </div>
                <p className="mt-4 text-xs text-zinc-600">
                  Find your Site ID and Collection ID in your Webflow dashboard under Site Settings → General → API.
                </p>
              </>
            )}

            {/* Env var setup instructions */}
            {!envConfigured?.hasApiToken && (
              <div className="mt-4 p-3 rounded-lg bg-midnight-900/50 border border-white/5">
                <p className="text-xs text-zinc-500">
                  <span className="text-electric-400 font-medium">Tip:</span> Create a <code className="px-1.5 py-0.5 bg-midnight-700 rounded text-electric-400">.env.local</code> file to save your credentials:
                </p>
                <pre className="mt-2 text-xs text-zinc-600 font-mono">
{`WEBFLOW_API_TOKEN=your_token_here
WEBFLOW_SITE_ID=your_site_id
WEBFLOW_COLLECTION_ID=your_collection_id`}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Main Content Area */}
        {!parsedBlog ? (
          /* Dropzone */
          <div
            {...getRootProps()}
            className={`
              glass rounded-3xl p-12 cursor-pointer transition-all duration-300
              border-2 border-dashed
              ${isDragActive 
                ? 'border-electric-500 bg-electric-500/5 glow-electric' 
                : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center py-16">
              <div className={`
                w-20 h-20 rounded-2xl mb-6 flex items-center justify-center transition-all duration-300
                ${isDragActive 
                  ? 'bg-electric-500/20 animate-float' 
                  : 'bg-gradient-to-br from-midnight-700 to-midnight-800'
                }
              `}>
                <svg 
                  className={`w-10 h-10 transition-colors ${isDragActive ? 'text-electric-400' : 'text-zinc-500'}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-white mb-2">
                {isDragActive ? 'Drop your markdown file here' : 'Upload Markdown File'}
              </h3>
              <p className="text-zinc-500 text-sm mb-6">
                Drag and drop your .md file, or click to browse
              </p>
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <span className="px-2 py-1 rounded bg-midnight-700">.md</span>
                <span>with YAML frontmatter supported</span>
              </div>
            </div>
          </div>
        ) : (
          /* Preview and Publish */
          <div className="space-y-6">
            {/* Status Messages */}
            {status === 'success' && successData && (
              <div className="glass rounded-2xl p-6 border border-green-500/30 bg-green-500/5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-green-400 font-medium">Draft Created Successfully!</h3>
                    <p className="text-zinc-400 text-sm mt-1">
                      Your blog post has been created as a draft in Webflow.
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <span className="text-zinc-500">Item ID: <code className="text-green-400">{successData.id}</code></span>
                      {successData.slug && (
                        <span className="text-zinc-500">Slug: <code className="text-green-400">{successData.slug}</code></span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="glass rounded-2xl p-6 border border-coral-500/30 bg-coral-500/5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-coral-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-coral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-coral-400 font-medium">Error</h3>
                    <p className="text-zinc-400 text-sm mt-1">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Metadata Card */}
            <div className="glass rounded-2xl p-6 glow-electric">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-electric-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Post Metadata
                </h2>
                <button
                  onClick={resetUpload}
                  className="text-sm text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Upload New
                </button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wide">Title</label>
                    <p className="text-white mt-1 font-medium">{parsedBlog.metadata.title || 'Untitled'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wide">Description</label>
                    <p className="text-zinc-300 mt-1 text-sm">{parsedBlog.metadata.description || 'No description'}</p>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide">Author</label>
                      <p className="text-zinc-300 mt-1">{parsedBlog.metadata.author || 'Unknown'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide">Date</label>
                      <p className="text-zinc-300 mt-1">{parsedBlog.metadata.date || 'Not set'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide">Reading Time</label>
                      <p className="text-zinc-300 mt-1">{parsedBlog.metadata.reading_time || 'N/A'}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {parsedBlog.metadata.keywords?.primary && (
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide">Primary Keyword</label>
                      <span className="mt-1 inline-block px-3 py-1 bg-electric-500/20 text-electric-400 rounded-full text-sm">
                        {parsedBlog.metadata.keywords.primary}
                      </span>
                    </div>
                  )}
                  {parsedBlog.metadata.keywords?.secondary && parsedBlog.metadata.keywords.secondary.length > 0 && (
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide">Secondary Keywords</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {parsedBlog.metadata.keywords.secondary.slice(0, 4).map((kw, i) => (
                          <span key={i} className="px-2 py-0.5 bg-midnight-700 text-zinc-400 rounded text-xs">
                            {kw}
                          </span>
                        ))}
                        {parsedBlog.metadata.keywords.secondary.length > 4 && (
                          <span className="px-2 py-0.5 text-zinc-600 text-xs">
                            +{parsedBlog.metadata.keywords.secondary.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {parsedBlog.metadata.featured_image && (
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide">Featured Image</label>
                      <p className="text-zinc-400 mt-1 text-sm font-mono truncate">{parsedBlog.metadata.featured_image}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content Preview */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-lg font-medium text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-electric-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Content Preview
                </h2>
                <span className="text-xs text-zinc-500">
                  {parsedBlog.metadata.word_count ? `${parsedBlog.metadata.word_count} words` : ''}
                </span>
              </div>
              <div className="p-6 max-h-[500px] overflow-y-auto">
                <div 
                  className="markdown-preview"
                  dangerouslySetInnerHTML={{ __html: parsedBlog.htmlContent }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-600">
                This will create a <span className="text-electric-400 font-medium">draft</span> in your Webflow CMS
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={resetUpload}
                  className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={status === 'submitting'}
                  className={`
                    px-8 py-3 rounded-xl font-medium transition-all duration-300
                    ${status === 'submitting'
                      ? 'bg-midnight-700 text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-electric-500 to-purple-600 text-white hover:shadow-lg hover:shadow-electric-500/25 hover:scale-[1.02] active:scale-[0.98]'
                    }
                  `}
                >
                  {status === 'submitting' ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Publishing...
                    </span>
                  ) : (
                    'Publish Draft to Webflow'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-zinc-600">
          <span>Webflow Blog Publisher</span>
          <span>Markdown → Webflow CMS</span>
        </div>
      </footer>
    </main>
  )
}

