import ReactMarkdown from 'react-markdown';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Clean up scraped content - remove navigation/boilerplate
function cleanContent(raw: string): string {
  let text = raw;
  
  // Remove entire sections that are profile/navigation boilerplate
  const sectionPatterns = [
    /Similar Traders[\s\S]*?(?=\n\n[A-Z]|\n\n#|$)/gi,
    /Performance \(Since[\s\S]*?(?=\n\n[A-Z]|\n\n#|$)/gi,
    /^\s*\d{4}\s*$[\s\S]*?(?=\n\n[A-Z]|\n\n#|$)/gm, // Year-only lines followed by performance data
    /\|\s*\d{4}\s*\|[\s\S]*?\|[\s\S]*?\|/gm, // Performance tables with years
    /\+?\d+\.?\d*%\s*[-–]\s*\+?\d+\.?\d*%/g, // Range percentages like "+5.2% - +12.3%"
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
    /^(Stats|About|Portfolio|Feed|Overview|Copy|Follow)$/gim,
    /Log in.*?Register/gi,
    /^\s*#+\s*$/gm, // empty headers
    /!\[.*?\]\(https?:\/\/.*?\)/g, // Image links (we'll handle images separately)
    /\[!\[.*?\]\(.*?\)\]\(.*?\)/g, // Nested image links
    /^\s*\[\s*\]\s*$/gm, // Empty link brackets
    /Popular Investor/gi,
    /Copy this trader/gi,
    /See performance/gi,
    /View (portfolio|stats|feed)/gi,
    /\d+\s*(copiers|followers)/gi,
    /AUM:?\s*\$?[\d.]+[KMB]?/gi,
    /^\s*[@#]\w+\s*$/gm, // Lone hashtags or mentions on their own line
  ];
  
  for (const pattern of removePatterns) {
    text = text.replace(pattern, '');
  }
  
  // Clean up excessive whitespace and empty lines
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+$/gm, '')
    .trim();
  
  // Skip mostly empty content
  if (text.length < 20) {
    return '';
  }
  
  // Limit length for feed display
  if (text.length > 600) {
    text = text.substring(0, 600) + '...';
  }
  
  return text;
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
