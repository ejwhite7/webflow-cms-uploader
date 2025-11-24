// Simple HTML sanitizer for XSS prevention in preview
// Allows only safe HTML tags and attributes

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'a', 'img',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span',
  'figure', 'figcaption',
])

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  '*': new Set(['class', 'id']),
}

// URL schemes that are safe for links
const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', '/'])

function isSafeUrl(url: string): boolean {
  try {
    // Allow relative URLs
    if (url.startsWith('/') || url.startsWith('#') || url.startsWith('./') || url.startsWith('../')) {
      return true
    }
    
    const parsed = new URL(url)
    return SAFE_URL_SCHEMES.has(parsed.protocol)
  } catch {
    // If URL parsing fails, check if it starts with a safe scheme
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')
  }
}

export function sanitizeHtml(html: string): string {
  // Create a DOM parser
  if (typeof window === 'undefined') {
    // Server-side: use regex-based sanitization
    return sanitizeHtmlRegex(html)
  }
  
  // Client-side: use DOM-based sanitization
  return sanitizeHtmlDOM(html)
}

function sanitizeHtmlDOM(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  sanitizeNode(doc.body)
  return doc.body.innerHTML
}

function sanitizeNode(node: Node): void {
  const nodesToRemove: Node[] = []
  
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element
      const tagName = element.tagName.toLowerCase()
      
      if (!ALLOWED_TAGS.has(tagName)) {
        // Remove disallowed tags but keep their content
        nodesToRemove.push(child)
        continue
      }
      
      // Remove disallowed attributes
      const tagAttrs = ALLOWED_ATTRIBUTES[tagName] || new Set<string>()
      const globalAttrs = ALLOWED_ATTRIBUTES['*'] || new Set<string>()
      const allowedAttrs = new Set([
        ...Array.from(tagAttrs),
        ...Array.from(globalAttrs),
      ])
      
      for (const attr of Array.from(element.attributes)) {
        if (!allowedAttrs.has(attr.name.toLowerCase())) {
          element.removeAttribute(attr.name)
          continue
        }
        
        // Check URL safety for href and src
        if ((attr.name === 'href' || attr.name === 'src') && !isSafeUrl(attr.value)) {
          element.removeAttribute(attr.name)
        }
        
        // Remove javascript: URLs and event handlers
        if (attr.value.toLowerCase().includes('javascript:')) {
          element.removeAttribute(attr.name)
        }
      }
      
      // Add security attributes to links
      if (tagName === 'a') {
        element.setAttribute('rel', 'noopener noreferrer')
        if (element.getAttribute('target') === '_blank') {
          // Already has target="_blank", rel is set above
        }
      }
      
      // Recursively sanitize children
      sanitizeNode(element)
    } else if (child.nodeType === Node.COMMENT_NODE) {
      // Remove comments (could contain IE conditional comments with scripts)
      nodesToRemove.push(child)
    }
  }
  
  // Remove nodes that need to be removed, but keep their children
  for (const nodeToRemove of nodesToRemove) {
    const parent = nodeToRemove.parentNode
    if (parent) {
      // Move children to parent before removing
      while (nodeToRemove.firstChild) {
        parent.insertBefore(nodeToRemove.firstChild, nodeToRemove)
      }
      parent.removeChild(nodeToRemove)
    }
  }
}

// Regex-based sanitization for server-side rendering
function sanitizeHtmlRegex(html: string): string {
  let sanitized = html
  
  // Remove script tags and content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  
  // Remove style tags and content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
  
  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, '')
  
  // Remove data: URLs (can be used for XSS)
  sanitized = sanitized.replace(/data\s*:[^"'\s>]+/gi, '')
  
  // Remove iframe, object, embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button)\b[^>]*>/gi, '')
  sanitized = sanitized.replace(/<\/(iframe|object|embed|form|input|button)>/gi, '')
  
  // Remove base tags (can hijack relative URLs)
  sanitized = sanitized.replace(/<base\b[^>]*>/gi, '')
  
  // Remove meta tags
  sanitized = sanitized.replace(/<meta\b[^>]*>/gi, '')
  
  // Remove link tags (can load external resources)
  sanitized = sanitized.replace(/<link\b[^>]*>/gi, '')
  
  // Add rel="noopener noreferrer" to links
  sanitized = sanitized.replace(
    /<a\s+([^>]*href\s*=\s*["'][^"']*["'][^>]*)>/gi,
    '<a $1 rel="noopener noreferrer">'
  )
  
  return sanitized
}

