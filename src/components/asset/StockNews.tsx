import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export function StockNews({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadNews() {
      if (!symbol) return;
      try {
        setLoading(true);
        setError(null);
        const normalized = symbol.trim();
        const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(normalized)}&region=US&lang=en-US`;

        const tryFetchXml = async (): Promise<string> => {
          // 1) allorigins raw
          try {
            const r1 = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`);
            if (r1.ok) return await r1.text();
          } catch {
            // ignore
          }

          // 2) allorigins get wrapper
          try {
            const r2 = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`);
            if (r2.ok) {
              const json = await r2.json().catch(() => null);
              const contents = json?.contents;
              if (typeof contents === 'string' && contents.length > 0) return contents;
            }
          } catch {
            // ignore
          }

          // 3) jina.ai plain fetch (last resort)
          try {
            const r3 = await fetch(`https://r.jina.ai/http://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(normalized)}&region=US&lang=en-US`);
            if (r3.ok) {
              const t = await r3.text();
              if (t.includes('<rss') || t.includes('<channel')) return t;
            }
          } catch {
            // ignore
          }

          throw new Error('Unable to fetch RSS feed via available proxies.');
        };

        const text = await tryFetchXml();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        const parseError = xml.querySelector('parsererror');
        if (parseError) {
          const title = xml.querySelector('title')?.textContent;
          if (title === 'Yahoo') {
              setNews([]);
              return;
          }
          throw new Error('Failed to parse RSS feed.');
        }

        const items = Array.from(xml.querySelectorAll('item')).map((item) => ({
          title: item.querySelector('title')?.textContent || '',
          link: item.querySelector('link')?.textContent || '',
          pubDate: item.querySelector('pubDate')?.textContent || '',
          source: item.querySelector('source')?.textContent || 'Yahoo Finance',
        }));
        setNews(items);
      } catch (e: any) {
        console.error(e);
        setError('Recent news failed to fetch.');
      } finally {
        setLoading(false);
      }
    }
    loadNews();
  }, [symbol]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent News</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            ))}
          </div>
        ) : error ? (
           <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
              <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-center">{error}</p>
            </div>
        ) : news.length > 0 ? (
          <div className="space-y-4 h-[400px] overflow-y-auto">
            {news.map((item, index) => (
              <a
                key={index}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <p className="font-semibold text-sm mb-1">{item.title}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{item.source}</span>
                  <span>{item.pubDate ? formatDistanceToNow(new Date(item.pubDate), { addSuffix: true }) : ''}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">No news found for this asset.</p>
        )}
      </CardContent>
    </Card>
  );
}
