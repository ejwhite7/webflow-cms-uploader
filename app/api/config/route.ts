import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  // Verify session
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  // Return env var configuration status (without exposing sensitive values)
  return NextResponse.json({
    siteId: process.env.WEBFLOW_SITE_ID || '',
    collectionId: process.env.WEBFLOW_COLLECTION_ID || '',
    hasApiToken: !!process.env.WEBFLOW_API_TOKEN,
  })
}

