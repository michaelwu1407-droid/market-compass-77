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
        const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
        const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
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
        setError('Failed to fetch news.');
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
