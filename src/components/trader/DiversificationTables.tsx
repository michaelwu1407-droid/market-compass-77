import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Globe, Building, MapPin } from 'lucide-react';
import type { TraderHolding } from '@/hooks/useTraderHoldings';

interface DiversificationTablesProps {
  holdings: TraderHolding[];
}

interface BreakdownItem {
  name: string;
  value: number;
  count: number;
}

function BreakdownTable({ data, icon: Icon, title }: { data: BreakdownItem[]; icon: React.ElementType; title: string }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{title.split(' ')[0]}</TableHead>
              <TableHead className="text-xs text-right">Weight</TableHead>
              <TableHead className="text-xs text-right"># Holdings</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 8).map((item) => (
              <TableRow key={item.name}>
                <TableCell className="text-sm font-medium">{item.name}</TableCell>
                <TableCell className="text-sm text-right">{item.value.toFixed(1)}%</TableCell>
                <TableCell className="text-sm text-right text-muted-foreground">{item.count}</TableCell>
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

    // Calculate exchange breakdown
    const exchangeMap = new Map<string, { value: number; count: number }>();
    holdings.forEach(h => {
      const exchange = h.assets?.exchange || 'Unknown';
      const weight = h.allocation_pct ?? h.current_value ?? 0;
      const existing = exchangeMap.get(exchange) || { value: 0, count: 0 };
      exchangeMap.set(exchange, { value: existing.value + weight, count: existing.count + 1 });
    });
    
    const exchangeData = Array.from(exchangeMap.entries())
      .map(([name, { value, count }]) => ({ name, value, count }))
      .sort((a, b) => b.value - a.value);

    // Calculate country breakdown (need to extend TraderHolding type)
    const countryMap = new Map<string, { value: number; count: number }>();
    holdings.forEach(h => {
      // @ts-ignore - country might not be in type yet
      const country = h.assets?.country || 'Unknown';
      const weight = h.allocation_pct ?? h.current_value ?? 0;
      const existing = countryMap.get(country) || { value: 0, count: 0 };
      countryMap.set(country, { value: existing.value + weight, count: existing.count + 1 });
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
