import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DiscrepancyTable } from '@/components/discrepancies/DiscrepancyTable';
import { DiscrepancyStats } from '@/components/discrepancies/DiscrepancyStats';
import { useDiscrepancies } from '@/hooks/useDiscrepancies';
import { AlertTriangle } from 'lucide-react';

export default function DiscrepanciesPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  const { data: discrepancies, isLoading } = useDiscrepancies({
    status: statusFilter,
    entityType: entityFilter,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-yellow-500/10">
          <AlertTriangle className="h-6 w-6 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Data Discrepancies</h1>
          <p className="text-muted-foreground">
            Review differences between Bullaware API and Firecrawl scraping
          </p>
        </div>
      </div>

      {/* Stats */}
      <DiscrepancyStats />

      {/* Filters and Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Discrepancy Log</CardTitle>
              <CardDescription>
                Cross-check results where data sources disagreed (Bullaware value used)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending_review">Pending</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="trader">Trader</SelectItem>
                  <SelectItem value="holding">Holding</SelectItem>
                  <SelectItem value="asset">Asset</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DiscrepancyTable discrepancies={discrepancies || []} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
