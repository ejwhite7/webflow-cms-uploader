import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Maximum content size (5MB)
const MAX_CONTENT_SIZE = 5 * 1024 * 1024

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

interface PublishRequest {
  metadata: BlogMetadata
  content: string
  siteId?: string
  collectionId?: string
  apiToken?: string
  useEnvCredentials?: boolean
}

// Generate a URL-friendly slug from the title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .trim()
    .substring(0, 100) // Limit length
}

// Sanitize HTML for Webflow RichText field
// Webflow RichText has limited support but tables CAN render on the live site with custom CSS
// We keep tables intact and only clean up elements that definitely won't work
function sanitizeHtmlForWebflow(html: string): string {
  let sanitized = html

  // Keep tables intact - they may appear broken in Webflow Designer but render on live site
  // User needs to add custom CSS to their Webflow site for proper table styling
  
  // Convert code blocks to blockquotes (code blocks aren't supported)
  sanitized = sanitized
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '<blockquote>$1</blockquote>')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '<blockquote>$1</blockquote>')
  
  // Convert inline code to emphasized text (no backticks, cleaner look)
  sanitized = sanitized.replace(/<code[^>]*>(.*?)<\/code>/gi, '<em>$1</em>')

  // Remove horizontal rules (not supported in Webflow RichText)
  sanitized = sanitized.replace(/<hr\s*\/?>/gi, '')

  // Clean up any empty paragraphs
  sanitized = sanitized
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')

  return sanitized
}

export async function POST(request: NextRequest) {
  try {
    // Verify session
    const session = await getSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check content length header
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: 'Content too large. Maximum size is 5MB.' },
        { status: 413 }
      )
    }

    const body: PublishRequest = await request.json()
    const { metadata, content, useEnvCredentials } = body

    // Validate content size
    if (content && content.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { error: 'Content too large. Maximum size is 5MB.' },
        { status: 413 }
      )
    }

    // Determine which credentials to use
    const collectionId = useEnvCredentials 
      ? process.env.WEBFLOW_COLLECTION_ID 
      : body.collectionId
    const apiToken = useEnvCredentials 
      ? process.env.WEBFLOW_API_TOKEN 
      : body.apiToken

    if (!collectionId || !apiToken) {
      return NextResponse.json(
        { error: 'Missing required configuration: collectionId or apiToken. Set environment variables or provide them manually.' },
        { status: 400 }
      )
    }

    if (!metadata.title) {
      return NextResponse.json(
        { error: 'Blog post must have a title' },
        { status: 400 }
      )
    }

    // Generate slug from title if not provided
    const slug = metadata.slug || generateSlug(metadata.title)

    // Sanitize HTML content for Webflow RichText compatibility
    const sanitizedContent = sanitizeHtmlForWebflow(content)

    // Prepare the field data for Webflow CMS
    // Field slugs match your Webflow Blog collection schema
    const fieldData: Record<string, unknown> = {
      // Required fields
      name: metadata.title,
      slug: slug,
      index: 'index', // Required option field - 'index' or 'noindex'
      
      // Main content (RichText) - sanitized for Webflow compatibility
      content: sanitizedContent,
      
      _archived: false,
      _draft: true,
    }

    // Card description (used for previews/cards)
    if (metadata.description) {
      fieldData['card-desc'] = metadata.description
      fieldData['meta-description'] = metadata.description
    }

    // Meta title for SEO
    if (metadata.title) {
      fieldData['meta-title'] = metadata.title
    }

    // Author (PlainText field)
    if (metadata.author) {
      fieldData['author'] = metadata.author
    }

    // Date (DateTime field)
    if (metadata.date) {
      fieldData['date'] = new Date(metadata.date).toISOString()
    }

    // Featured image
    if (metadata.featured_image) {
      // For images, Webflow expects an object with url property
      fieldData['image'] = {
        url: metadata.featured_image,
        alt: metadata.featured_image_alt || metadata.title,
      }
    }

    // Make the API request to Webflow
    const webflowResponse = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          fieldData,
          isDraft: true, // Ensure it's created as a draft
        }),
      }
    )

    const webflowData = await webflowResponse.json()

    if (!webflowResponse.ok) {
      console.error('Webflow API error:', webflowData)
      
      // Provide helpful error messages
      if (webflowResponse.status === 401) {
        return NextResponse.json(
          { error: 'Invalid API token. Please check your Webflow API credentials.' },
          { status: 401 }
        )
      }
      
      if (webflowResponse.status === 404) {
        return NextResponse.json(
          { error: 'Collection not found. Please verify your Collection ID.' },
          { status: 404 }
        )
      }

      // Handle field mapping errors
      if (webflowData.message?.includes('field')) {
        return NextResponse.json(
          { 
            error: `Field mapping error: ${webflowData.message}. Your Webflow collection may use different field names. Check the README for field configuration.`,
            details: webflowData
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: webflowData.message || 'Failed to create item in Webflow', details: webflowData },
        { status: webflowResponse.status }
      )
    }

    return NextResponse.json({
      success: true,
      id: webflowData.id,
      slug: slug,
      message: 'Draft created successfully in Webflow',
    })

  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

