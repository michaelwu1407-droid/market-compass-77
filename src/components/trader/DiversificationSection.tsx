import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DiversificationChart } from '@/components/charts/DiversificationChart';
import { DiversificationTables } from '@/components/trader/DiversificationTables';
import { PieChart } from 'lucide-react';
import type { TraderHolding } from '@/hooks/useTraderHoldings';

interface DiversificationSectionProps {
  holdings: TraderHolding[];
  showTables?: boolean;
}

export function DiversificationSection({ holdings, showTables = true }: DiversificationSectionProps) {
  if (!holdings || holdings.length === 0) {
    return null;
  }

  // Calculate sector breakdown
  const sectorMap = new Map<string, number>();
  holdings.forEach(h => {
    const sector = h.assets?.sector || 'Other';
    const weight = h.allocation_pct ?? h.current_value ?? 0;
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + weight);
  });
  
  const sectorData = Array.from(sectorMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Calculate asset type breakdown
  const typeMap = new Map<string, number>();
  holdings.forEach(h => {
    const type = h.assets?.asset_type || 'Stock';
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);
    const weight = h.allocation_pct ?? h.current_value ?? 0;
    typeMap.set(typeName, (typeMap.get(typeName) || 0) + weight);
  });
  
  const typeData = Array.from(typeMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Calculate top holdings
  const topHoldings = [...holdings]
    .sort((a, b) => {
      const aWeight = a.allocation_pct ?? a.current_value ?? 0;
      const bWeight = b.allocation_pct ?? b.current_value ?? 0;
      return bWeight - aWeight;
    })
    .slice(0, 5)
    .map(h => ({
      name: h.assets?.symbol || 'Unknown',
      value: h.allocation_pct ?? h.current_value ?? 0,
    }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Portfolio Diversification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <DiversificationChart data={sectorData} title="By Sector" />
            <DiversificationChart data={typeData} title="By Asset Type" />
            <DiversificationChart data={topHoldings} title="Top Holdings" />
          </div>
        </CardContent>
      </Card>
      
      {showTables && <DiversificationTables holdings={holdings} />}
    </div>
  );
}
