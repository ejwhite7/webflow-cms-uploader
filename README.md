# Webflow Blog Publisher

A secure Next.js application that parses markdown files with YAML frontmatter and publishes them as drafts to your Webflow CMS.

## Features

- 🔐 **Password-protected access** with secure session management
- 🎨 Modern, dark-themed UI with glassmorphism effects
- 📁 Drag-and-drop markdown file upload
- 📝 YAML frontmatter parsing for post metadata
- 👀 Live preview with XSS-sanitized content
- 🚀 Direct integration with Webflow CMS API v2
- 📋 Creates posts as **drafts** (not published)
- 🛡️ Rate limiting and security headers
- ☁️ Ready for Vercel deployment

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Webflow site with CMS enabled
- A Webflow API token

### Installation

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file in the project root:

```bash
# Authentication (REQUIRED)
AUTH_USERNAME=your_username
AUTH_PASSWORD=your_secure_password

# Webflow Configuration
WEBFLOW_API_TOKEN=your_api_token_here
WEBFLOW_SITE_ID=your_site_id_here
WEBFLOW_COLLECTION_ID=your_collection_id_here
```

⚠️ **Important**: `AUTH_USERNAME` and `AUTH_PASSWORD` are required for the app to function.

### Getting Your Webflow Credentials

1. **API Token**: Go to Webflow Dashboard → Account Settings → Integrations → Generate API Token
2. **Site ID**: Go to Site Settings → General → scroll down to find your Site ID
3. **Collection ID**: Go to CMS → click on your Blog collection → Collection Settings → Collection ID

## Deployment to Vercel

### Quick Deploy

1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Add the following environment variables in Vercel's project settings:

| Variable | Description |
|----------|-------------|
| `AUTH_USERNAME` | Login username |
| `AUTH_PASSWORD` | Login password (use a strong password!) |
| `WEBFLOW_API_TOKEN` | Your Webflow API token |
| `WEBFLOW_SITE_ID` | Your Webflow site ID |
| `WEBFLOW_COLLECTION_ID` | Your blog collection ID |

4. Deploy!

### Manual Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

## Security Features

### Authentication
- Simple username/password authentication
- Secure session cookies (HttpOnly, Secure in production, SameSite)
- Session expiration after 24 hours
- Timing-safe password comparison to prevent timing attacks
- Login attempt limiting (5 attempts, 15-minute lockout)

### API Protection
- All API routes require authentication
- Rate limiting: 30 requests per minute per IP
- Content size limits (5MB max)
- Security headers (HSTS, X-Frame-Options, etc.)

### XSS Prevention
- All markdown preview content is sanitized
- Dangerous HTML tags/attributes removed
- JavaScript URLs blocked
- Event handlers stripped

## Markdown File Format

Your markdown files should include YAML frontmatter at the top:

```markdown
---
title: "Your Blog Post Title"
description: "A brief description for SEO and previews"
author: "Author Name"
date: "2025-01-15"
featured_image: "/images/blog/your-image.jpg"
featured_image_alt: "Description of the image"
reading_time: "5 min"
keywords:
  primary: "main keyword"
  secondary: ["keyword1", "keyword2"]
canonical_url: "https://yoursite.com/blog/post-slug"
---

# Your Blog Post Title

Your markdown content goes here...
```

## Webflow Collection Field Mapping

The app maps your markdown metadata to Webflow CMS fields:

| Markdown Field | Webflow Field Slug | Type |
|---------------|-------------------|------|
| `title` | `name` | PlainText (required) |
| — | `slug` | PlainText (required, auto-generated) |
| — | `index` | Option (required, defaults to "index") |
| `content` | `content` | RichText |
| `description` | `card-desc`, `meta-description` | PlainText |
| `title` | `meta-title` | PlainText |
| `author` | `author` | PlainText |
| `date` | `date` | DateTime |
| `featured_image` | `image` | Image |

### Table Styling in Webflow

Webflow's RichText field has limited native table support. Add this CSS to your Webflow site (Site Settings → Custom Code → Head Code):

```css
.w-richtext table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
}

.w-richtext th,
.w-richtext td {
  padding: 0.75rem 1rem;
  border: 1px solid #e5e5e5;
  text-align: left;
}

.w-richtext th {
  background-color: #f5f5f5;
  font-weight: 600;
}

.w-richtext tr:nth-child(even) {
  background-color: #fafafa;
}
```

### Customizing Field Mapping

If your Webflow collection uses different field names, edit `app/api/publish/route.ts` and update the `fieldData` object.

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS
- **Markdown**: gray-matter (YAML parsing), marked (Markdown to HTML)
- **UI**: react-dropzone for file uploads
- **Fonts**: Geist Sans & Mono
- **Deployment**: Vercel-ready

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## API Reference

### POST /api/auth/login

Authenticate user.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

### POST /api/auth/logout

End session.

### GET /api/auth/check

Check authentication status.

### GET /api/config

Get Webflow configuration status (requires auth).

### POST /api/publish

Publish a blog post draft to Webflow (requires auth).

**Request Body:**
```json
{
  "metadata": {
    "title": "string",
    "description": "string",
    "author": "string",
    "date": "string"
  },
  "content": "string (HTML)",
  "useEnvCredentials": true
}
```

## License

MIT
