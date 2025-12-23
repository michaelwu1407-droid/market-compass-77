import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Globe, Building, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TraderHolding } from '@/hooks/useTraderHoldings';

interface DiversificationTablesProps {
  holdings: TraderHolding[];
}

interface BreakdownItem {
  name: string;
  value: number;
  count: number;
}

// Country code to name mapping
const COUNTRY_NAMES: Record<string, string> = {
  'US': 'United States',
  'GB': 'United Kingdom',
  'DE': 'Germany',
  'FR': 'France',
  'IT': 'Italy',
  'ES': 'Spain',
  'NL': 'Netherlands',
  'CH': 'Switzerland',
  'JP': 'Japan',
  'HK': 'Hong Kong',
  'TW': 'Taiwan',
  'AU': 'Australia',
  'CA': 'Canada',
};

function BreakdownTable({ data, icon: Icon, title }: { data: BreakdownItem[]; icon: React.ElementType; title: string }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs h-8">{title.split(' ')[0]}</TableHead>
              <TableHead className="text-xs text-right h-8 w-20">Weight</TableHead>
              <TableHead className="text-xs text-right h-8 w-12">#</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 6).map((item, idx) => (
              <TableRow key={item.name} className="hover:bg-muted/50">
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <div 
                      className={cn(
                        "w-1.5 h-4 rounded-full",
                        idx === 0 ? "bg-primary" : idx === 1 ? "bg-primary/70" : "bg-muted-foreground/40"
                      )}
                    />
                    <span className="text-sm font-medium truncate max-w-[120px]">{item.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 bg-muted rounded-full h-1.5 hidden sm:block">
                      <div 
                        className="bg-primary/60 h-1.5 rounded-full" 
                        style={{ width: `${(item.value / maxValue) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm tabular-nums">{item.value.toFixed(1)}%</span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-right text-muted-foreground text-sm tabular-nums">
                  {item.count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function DiversificationTables({ holdings }: DiversificationTablesProps) {
  const { sectorData, exchangeData, countryData } = useMemo(() => {
    if (!holdings || holdings.length === 0) {
      return { sectorData: [], exchangeData: [], countryData: [] };
    }

    // Calculate sector breakdown
    const sectorMap = new Map<string, { value: number; count: number }>();
    holdings.forEach(h => {
      const sector = h.assets?.sector || 'Other';
      const weight = h.allocation_pct ?? h.current_value ?? 0;
      const existing = sectorMap.get(sector) || { value: 0, count: 0 };
      sectorMap.set(sector, { value: existing.value + weight, count: existing.count + 1 });
    });
    
    const sectorData = Array.from(sectorMap.entries())
      .map(([name, { value, count }]) => ({ name, value, count }))
      .sort((a, b) => b.value - a.value);

    // Calculate exchange breakdown - group unknown/null as "Other US" if country is US
    const exchangeMap = new Map<string, { value: number; count: number }>();
    holdings.forEach(h => {
      let exchange = h.assets?.exchange;
      // If no exchange, check if it's a US stock and label appropriately
      if (!exchange || exchange === 'Unknown') {
        // @ts-ignore
        const country = h.assets?.country;
        if (country === 'US') {
          exchange = 'US Stocks';
        } else {
          exchange = 'Other';
        }
      }
      const weight = h.allocation_pct ?? h.current_value ?? 0;
      const existing = exchangeMap.get(exchange) || { value: 0, count: 0 };
      exchangeMap.set(exchange, { value: existing.value + weight, count: existing.count + 1 });
    });
    
    const exchangeData = Array.from(exchangeMap.entries())
      .map(([name, { value, count }]) => ({ name, value, count }))
      .sort((a, b) => b.value - a.value);

    // Calculate country breakdown with proper names
    const countryMap = new Map<string, { value: number; count: number }>();
    holdings.forEach(h => {
      // @ts-ignore - country might not be in type yet
      const countryCode = h.assets?.country || 'Unknown';
      const countryName = COUNTRY_NAMES[countryCode] || countryCode;
      const weight = h.allocation_pct ?? h.current_value ?? 0;
      const existing = countryMap.get(countryName) || { value: 0, count: 0 };
      countryMap.set(countryName, { value: existing.value + weight, count: existing.count + 1 });
    });
    
    const countryData = Array.from(countryMap.entries())
      .map(([name, { value, count }]) => ({ name, value, count }))
      .sort((a, b) => b.value - a.value);

    return { sectorData, exchangeData, countryData };
  }, [holdings]);

  if (!holdings || holdings.length === 0) {
    return null;
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <BreakdownTable data={sectorData} icon={Building} title="Sector Breakdown" />
      <BreakdownTable data={exchangeData} icon={Globe} title="Exchange Breakdown" />
      <BreakdownTable data={countryData} icon={MapPin} title="Country Breakdown" />
    </div>
  );
}
