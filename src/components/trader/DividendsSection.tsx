import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DividendsSectionProps {
  portfolioDividendYield?: number | null;
  annualDividendIncome?: number | null;
  dividendPayingStocks?: number | null;
  totalHoldings?: number | null;
}

export function DividendsSection({
  portfolioDividendYield,
  annualDividendIncome,
  dividendPayingStocks,
  totalHoldings,
}: DividendsSectionProps) {
  const hasData = portfolioDividendYield !== null && portfolioDividendYield !== undefined;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Dividends
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <span className="text-xs text-muted-foreground block mb-1">Portfolio Yield</span>
                <span className={cn(
                  "text-xl font-bold",
                  portfolioDividendYield !== null && portfolioDividendYield !== undefined && portfolioDividendYield > 0
                    ? "text-gain"
                    : "text-muted-foreground"
                )}>
                  {portfolioDividendYield?.toFixed(2) ?? '-'}%
                </span>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <span className="text-xs text-muted-foreground block mb-1">Est. Annual Income</span>
                <span className="text-xl font-bold">
                  {annualDividendIncome !== null && annualDividendIncome !== undefined
                    ? `$${annualDividendIncome.toLocaleString()}`
                    : '-'}
                </span>
              </div>
            </div>
            
            {dividendPayingStocks !== null && totalHoldings !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Dividend-paying stocks</span>
                <span className="font-medium">{dividendPayingStocks} of {totalHoldings}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Dividend information not available for this portfolio.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
