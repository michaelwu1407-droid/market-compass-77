import ReactMarkdown from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Extract ONLY the actual post content from scraped eToro pages
function cleanContent(raw: string): string {
  let text = raw;
  
  // Fix escaped markdown characters from Firecrawl
  text = text.replace(/\\\\/g, '\n');    // \\ -> newline
  text = text.replace(/\\_/g, '_');       // \_ -> underscore
  text = text.replace(/\\n/g, '\n');      // Literal \n string -> newline
  text = text.replace(/\\\[/g, '[');      // \[ -> bracket
  text = text.replace(/\\\]/g, ']');      // \] -> bracket
  text = text.replace(/\\\*/g, '*');      // \* -> asterisk
  text = text.replace(/\\#/g, '#');       // \# -> hash
  text = text.replace(/\\-/g, '-');       // \- -> dash
  
  // First, try to extract just the post content after common markers
  // Look for patterns like "[12d]" or "[13d]" followed by actual content
  const postDatePattern = /\[(\d+[dhm])\]\([^)]+\)\s*(Edited\s*)?/gi;
  const postMatches = text.split(postDatePattern);
  
  // If we found date markers, the actual post content is usually after them
  if (postMatches.length > 1) {
    // Find the last substantive content block (usually the actual post)
    for (let i = postMatches.length - 1; i >= 0; i--) {
      const segment = postMatches[i]?.trim();
      // Skip short segments (dates, "Edited", etc.)
      if (segment && segment.length > 100 && !segment.match(/^\d+[dhm]$/i) && segment !== 'Edited') {
        // This might be the actual post content - clean it further
        text = segment;
        break;
      }
    }
  }
  
  // Remove everything BEFORE the actual post content
  // Common patterns that precede posts
  const startMarkers = [
    /^[\s\S]*?(?:Discussions\s*Top\s*All\s*Mentions\s*)/i,
    /^[\s\S]*?(?:Profitable Weeks\s*[\d.]+%\s*)/i,
    /^[\s\S]*?(?:Avg\. Risk Score[^)]+\)\s*\d+\s*)/i,
  ];
  
  for (const pattern of startMarkers) {
    text = text.replace(pattern, '');
  }
  
  // Remove "Similar Traders" sections completely - they're not posts
  if (text.includes('## Similar Traders') || text.startsWith('- [![')) {
    return ''; // This is navigation, not a post
  }
  
  // Remove entire sections that are profile/navigation boilerplate
  const sectionPatterns = [
    // Remove "Similar Traders" section entirely
    /##?\s*Similar Traders[\s\S]*$/gi,
    /Traders You Might Like[\s\S]*$/gi,
    
    // Remove performance blocks
    /##?\s*Performance[\s\S]*?(?=\n\n[A-Z][a-z]|$)/gi,
    /Return YTD[\s\S]*?Profitable Weeks\s*[\d.]+%/gi,
    
    // Remove navigation headers with images/links
    /^Copy\s*\n\[!\[/gm,
    /^\[!\[.*?\]\(.*?\)\]\(.*?\)\s*$/gm,
    
    // Remove profile header blocks
    /^\[!\[.*?\]\(https:\/\/etoro-cdn[^)]+\)\]\([^)]+\)[\s\S]*?@\w+\s*Copy/gm,
    
    // Remove footer/navigation
    /eToro.*?regulated[\s\S]*$/gi,
    /Risk Warning[\s\S]*$/gi,
    /CFDs are complex[\s\S]*$/gi,
    
    // Remove year-by-year performance lines
    /^[-+]?\d+\.?\d*%\d{4}\s*$/gm,
    /^\d{4}\s*$/gm,
    /^[-+]?\d+\.?\d*%\s*$/gm,
  ];
  
  for (const pattern of sectionPatterns) {
    text = text.replace(pattern, '');
  }
  
  // Remove specific boilerplate elements
  const removePatterns = [
    // Avatar and profile images
    /!\[.*?\]\(https?:\/\/etoro-cdn[^)]+\)/g,
    /\[!\[.*?\]\([^)]+\)\]\([^)]+\)/g,
    
    // Profile links with avatars
    /\[!\[[^\]]*\]\([^)]+\)\s*[^\]]+\s*@\w+\]\([^)]+\)/g,
    
    // Stats and metrics
    /Risk Score:?\s*\d+/gi,
    /Copiers:?\s*[\d,]+/gi,
    /AUM:?\s*\$?[\d.]+[KMB]?/gi,
    /Return\s*(YTD|2Y|12M|24M)[\s:]+[-+]?\d+\.?\d*%/gi,
    /Avg\.\s*Risk Score[^)]*\)\s*\d+/gi,
    /Profitable Weeks\s*[\d.]+%/gi,
    
    // Navigation elements
    /^(Stats|About|Portfolio|Feed|Overview|Copy|Follow|Trade|Invest|Top|All|Mentions)\s*$/gim,
    /^Copy$/gm,
    /Log in.*?Register/gi,
    /Popular Investor/gi,
    
    // Markdown tables
    /^\s*\|.*\|.*$/gm,
    /^[-|:]+$/gm,
    
    // Empty or malformed elements
    /^\s*#+\s*$/gm,
    /^\s*\[\s*\]\s*$/gm,
    
    // Country names alone on a line (from profile headers)
    /^(Denmark|United Arab Emirates|Germany|United Kingdom|United States|France|Spain|Italy|Netherlands|Sweden|Norway|Finland|Australia|Canada|Japan|South Korea|Singapore|Hong Kong|Switzerland|Austria|Belgium|Ireland|Portugal|Poland|Czech Republic|Hungary|Romania|Bulgaria|Greece|Turkey|Israel|India|Brazil|Mexico|Argentina|Chile|Colombia|Peru|South Africa|Egypt|Nigeria|Kenya|Morocco|Philippines|Indonesia|Malaysia|Thailand|Vietnam|Taiwan|China)\s*$/gim,
    
    // Date links like [12d](url)
    /\[\d+[dhm]\]\([^)]+\)/g,
    /Edited/g,
    
    // Percentage-only content
    /^\d+\.?\d*%0%-\d+\.?\d*%$/gm,
  ];
  
  for (const pattern of removePatterns) {
    text = text.replace(pattern, '');
  }
  
  // Clean up trader name + handle patterns at start
  text = text.replace(/^[A-Z][a-z]+\s+(?:[A-Z][a-z]+\s+)?@\w+\s*/gm, '');
  
  // Clean up excessive whitespace
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+$/gm, '')
    .replace(/^\n+/, '')
    .trim();
  
  // Reject content that's too short or still looks like garbage
  const textOnly = text.replace(/[^a-zA-Z\s]/g, '').trim();
  const wordCount = textOnly.split(/\s+/).filter(w => w.length > 2).length;
  
  // Need at least 10 real words for a valid post
  if (wordCount < 10) {
    return '';
  }
  
  // Limit length for feed display
  if (text.length > 1000) {
    // Try to cut at a sentence boundary
    const truncated = text.substring(0, 1000);
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > 700) {
      text = truncated.substring(0, lastPeriod + 1);
    } else {
      text = truncated + '...';
    }
  }
  
  return text;
}

// Check if content is mostly garbage/boilerplate
export function isValidPostContent(content: string): boolean {
  const cleaned = cleanContent(content);
  return cleaned.length >= 50;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  const cleanedContent = cleanContent(content);
  
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        components={{
          // Render images properly with lazy loading
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt || 'Image'}
              className="rounded-lg max-h-64 w-auto object-cover my-2"
              loading="lazy"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ),
          // Style headers
          h1: ({ children }) => (
            <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
          ),
          h2: ({ children }) => (
            <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>
          ),
          h3: ({ children }) => (
            <h5 className="text-sm font-medium mt-1 mb-1">{children}</h5>
          ),
          // Style paragraphs
          p: ({ children }) => (
            <p className="text-sm leading-relaxed mb-2">{children}</p>
          ),
          // Style links
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),
          // Style lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside text-sm space-y-1 mb-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside text-sm space-y-1 mb-2">{children}</ol>
          ),
          // Style blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
          // Style code
          code: ({ children }) => (
            <code className="bg-muted px-1 py-0.5 rounded text-xs">{children}</code>
          ),
        }}
      >
        {cleanedContent}
      </ReactMarkdown>
    </div>
  );
}
