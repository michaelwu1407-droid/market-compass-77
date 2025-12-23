import ReactMarkdown from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Clean up scraped content - AGGRESSIVELY remove navigation/boilerplate from eToro pages
function cleanContent(raw: string): string {
  let text = raw;
  
  // Remove entire sections that are profile/navigation boilerplate
  const sectionPatterns = [
    // Remove "Similar Traders" section entirely (contains avatars, percentages, names)
    /Similar Traders[\s\S]*?(?=\n\n[A-Z]|\n\n#|$)/gi,
    /Traders You Might Like[\s\S]*?(?=\n\n|$)/gi,
    
    // Remove performance history blocks
    /Performance \(Since[\s\S]*?(?=\n\n[A-Z]|\n\n#|$)/gi,
    /Performance History[\s\S]*?(?=\n\n|$)/gi,
    /^\s*\d{4}\s*$[\s\S]*?(?=\n\n[A-Z]|\n\n#|$)/gm,
    
    // Remove tables with years/percentages (performance data)
    /\|\s*\d{4}\s*\|[\s\S]*?\|[\s\S]*?\|/gm,
    /\+?\d+\.?\d*%\s*[-–]\s*\+?\d+\.?\d*%/g,
    
    // Remove entire profile header sections
    /^#+\s*\[.*?\]\(.*?\)[\s\S]*?(?=\n\n)/gm,
    
    // Remove asset/instrument sections that are navigation
    /Top Instruments[\s\S]*?(?=\n\n|$)/gi,
    /Portfolio Distribution[\s\S]*?(?=\n\n|$)/gi,
    /Trading Stats[\s\S]*?(?=\n\n|$)/gi,
    
    // Remove footer/navigation sections
    /eToro.*?regulated.*?[\s\S]*?$/gi,
    /Risk Warning[\s\S]*$/gi,
    /CFDs are complex instruments[\s\S]*$/gi,
  ];
  
  for (const pattern of sectionPatterns) {
    text = text.replace(pattern, '');
  }
  
  // Remove specific boilerplate phrases and navigation elements
  const removePatterns = [
    /Risk Score:?\s*\d+/gi,
    /Copiers:?\s*[\d,]+/gi,
    /^\s*\|.*\|.*$/gm, // markdown tables
    /^[-|:]+$/gm, // table separators
    /Follow\s+Copy/gi,
    /^(Stats|About|Portfolio|Feed|Overview|Copy|Follow|Trade|Invest)$/gim,
    /Log in.*?Register/gi,
    /^\s*#+\s*$/gm, // empty headers
    /!\[.*?\]\(https?:\/\/.*?\)/g, // Image links
    /\[!\[.*?\]\(.*?\)\]\(.*?\)/g, // Nested image links
    /^\s*\[\s*\]\s*$/gm, // Empty link brackets
    /Popular Investor/gi,
    /Copy this trader/gi,
    /See performance/gi,
    /View (portfolio|stats|feed|profile)/gi,
    /\d+\s*(copiers|followers)/gi,
    /AUM:?\s*\$?[\d.]+[KMB]?/gi,
    /^\s*[@#]\w+\s*$/gm, // Lone hashtags or mentions
    
    // Remove percentage-only lines (performance indicators)
    /^[+-]?\d+\.?\d*%\s*$/gm,
    
    // Remove avatar image URLs
    /https?:\/\/[^\s]*avatar[^\s]*/gi,
    /https?:\/\/[^\s]*profile[^\s]*/gi,
    /https?:\/\/etoro[^\s]*/gi,
    
    // Remove "X followers" style text
    /\d+[KMB]?\s*(followers?|following|copiers?)/gi,
    
    // Remove navigation breadcrumbs
    /^(Home|Discover|Markets|People)\s*[>›]/gim,
    
    // Remove "View on eToro" type CTAs
    /View on \w+/gi,
    /Open.*?Position/gi,
    /Start.*?Copying/gi,
    
    // Remove profile stats lines
    /^\s*(Invested in|Returns|Risk|Since)\s*[:|-]?\s*[\d.%KMB+-]+\s*$/gim,
    
    // Remove markdown links that are just usernames
    /\[@\w+\]\([^)]+\)/g,
    
    // Remove lines that are just names/usernames
    /^\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s*$/gm,
  ];
  
  for (const pattern of removePatterns) {
    text = text.replace(pattern, '');
  }
  
  // Clean up excessive whitespace and empty lines
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+$/gm, '')
    .trim();
  
  // Skip mostly empty or garbage content (less than 50 chars of actual text)
  const textOnly = text.replace(/[^a-zA-Z]/g, '');
  if (textOnly.length < 50) {
    return '';
  }
  
  // Limit length for feed display
  if (text.length > 800) {
    text = text.substring(0, 800) + '...';
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
