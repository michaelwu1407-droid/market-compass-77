import { useNavigate } from 'react-router-dom';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TraderHolding } from '@/hooks/useTraderHoldings';

interface HoldingsTableProps {
  holdings: TraderHolding[];
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  const navigate = useNavigate();

  if (!holdings || holdings.length === 0) {
    return (
      <p className="p-4 text-muted-foreground text-sm">No holdings data available</p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Sector</TableHead>
            <TableHead className="text-center">Direction</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead className="text-right">P&L</TableHead>
            <TableHead className="text-right">Avg Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((holding) => {
            const weight = holding.allocation_pct ?? holding.current_value ?? 0;
            const pnl = holding.profit_loss_pct || 0;
            const isLong = pnl >= 0; // Assume long if P/L is positive or we don't have direction info
            
            return (
              <TableRow 
                key={holding.id}
                className="cursor-pointer hover:bg-secondary/50"
                onClick={() => holding.asset_id && navigate(`/assets/${holding.asset_id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {holding.assets?.logo_url && (
                      <img 
                        src={holding.assets.logo_url} 
                        alt="" 
                        className="w-6 h-6 rounded-full object-cover"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    )}
                    <div>
                      <div className="font-medium">{holding.assets?.name || 'Unknown'}</div>
                      <Badge variant="secondary" className="text-xs">{holding.assets?.symbol || 'N/A'}</Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {holding.assets?.sector || '-'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      isLong ? "border-gain text-gain" : "border-loss text-loss"
                    )}
                  >
                    {isLong ? (
                      <><ArrowUp className="h-3 w-3 mr-1" /> Long</>
                    ) : (
                      <><ArrowDown className="h-3 w-3 mr-1" /> Short</>
                    )}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {weight.toFixed(1)}%
                </TableCell>
                <TableCell className={cn("text-right font-medium", pnl >= 0 ? "text-gain" : "text-loss")}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {holding.avg_open_price ? `$${Number(holding.avg_open_price).toFixed(2)}` : '-'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
