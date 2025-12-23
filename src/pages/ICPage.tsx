import { useState } from 'react';
import { Plus, LayoutGrid, Table as TableIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReportTable } from '@/components/ic/ReportTable';
import { ReportKanban } from '@/components/ic/ReportKanban';
import { useReports, useUpdateReport, DBReport } from '@/hooks/useReports';
import type { Report, ReportStatus, Rating } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';

type ViewMode = 'table' | 'kanban';

// Transform DB report to frontend Report type
function transformReport(dbReport: DBReport): Report {
  return {
    id: dbReport.id,
    user_id: dbReport.created_by || '',
    report_type: (dbReport.report_type as Report['report_type']) || 'single_stock',
    title: dbReport.title,
    input_assets: dbReport.input_assets || [],
    input_trader_ids: dbReport.input_trader_ids || [],
    horizon: (dbReport.horizon as Report['horizon']) || '12m',
    raw_prompt: '',
    raw_response: dbReport.raw_response || '',
    summary: dbReport.summary || '',
    upside_pct_estimate: dbReport.upside_pct_estimate,
    rating: dbReport.rating as Rating | null,
    score_6m: dbReport.score_6m,
    score_12m: dbReport.score_12m,
    score_long_term: dbReport.score_long_term,
    status: (dbReport.status as ReportStatus) || 'to_review',
    created_at: dbReport.created_at || new Date().toISOString(),
    updated_at: dbReport.updated_at || new Date().toISOString(),
  };
}

export default function ICPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [horizonFilter, setHorizonFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const navigate = useNavigate();

  const { data: dbReports, isLoading, error } = useReports({ starredForIC: true });
  const updateReport = useUpdateReport();

  const reports = (dbReports || []).map(transformReport);

  // Filter and sort reports
  let filteredReports = [...reports];

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredReports = filteredReports.filter(
      r => r.title.toLowerCase().includes(query) ||
           r.input_assets.some(a => a.toLowerCase().includes(query))
    );
  }

  if (ratingFilter !== 'all') {
    filteredReports = filteredReports.filter(r => r.rating === ratingFilter);
  }

  if (statusFilter !== 'all') {
    filteredReports = filteredReports.filter(r => r.status === statusFilter);
  }

  if (horizonFilter !== 'all') {
    filteredReports = filteredReports.filter(r => r.horizon === horizonFilter);
  }

  // Sort
  filteredReports.sort((a, b) => {
    if (sortBy === 'created_at') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    if (sortBy === 'upside') {
      return (b.upside_pct_estimate || 0) - (a.upside_pct_estimate || 0);
    }
    if (sortBy === 'score_6m') {
      return (b.score_6m || 0) - (a.score_6m || 0);
    }
    return 0;
  });

  const ratingColors = {
    buy: 'bg-gain/10 text-gain border-gain',
    hold: 'bg-warning/10 text-warning border-warning',
    avoid: 'bg-loss/10 text-loss border-loss',
  };

  const statusColors = {
    to_review: 'bg-warning/10 text-warning',
    in_progress: 'bg-primary/10 text-primary',
    approved: 'bg-gain/10 text-gain',
    rejected: 'bg-loss/10 text-loss',
  };

  const handleRatingChange = (rating: string) => {
    if (selectedReport) {
      updateReport.mutate({ id: selectedReport.id, rating });
      setSelectedReport({ ...selectedReport, rating: rating as Rating });
    }
  };

  const handleStatusChange = (status: string) => {
    if (selectedReport) {
      updateReport.mutate({ id: selectedReport.id, status });
      setSelectedReport({ ...selectedReport, status: status as ReportStatus });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Investment Committee</h1>
          <p className="text-muted-foreground">Manage and review starred reports</p>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Investment Committee</h1>
          <p className="text-muted-foreground">Manage and review starred reports</p>
        </div>
        <Button onClick={() => navigate('/analysis')}>
          <Plus className="h-4 w-4 mr-2" />
          New Report
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <div className="col-span-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ticker or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratings</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="hold">Hold</SelectItem>
            <SelectItem value="avoid">Avoid</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="to_review">To Review</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={horizonFilter} onValueChange={setHorizonFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Horizon" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Horizons</SelectItem>
            <SelectItem value="6m">6 months</SelectItem>
            <SelectItem value="12m">12 months</SelectItem>
            <SelectItem value="long_term">Long term</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger>
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Created</SelectItem>
            <SelectItem value="upside">Upside %</SelectItem>
            <SelectItem value="score_6m">6M Score</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant={viewMode === 'table' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('table')}
        >
          <TableIcon className="h-4 w-4 mr-1" />
          Table
        </Button>
        <Button
          variant={viewMode === 'kanban' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('kanban')}
        >
          <LayoutGrid className="h-4 w-4 mr-1" />
          Kanban
        </Button>
      </div>

      {/* Content */}
      {filteredReports.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No starred reports yet</p>
          <p className="text-sm mt-2">Create a report and star it for IC review</p>
        </div>
      ) : viewMode === 'table' ? (
        <ReportTable reports={filteredReports} onSelect={setSelectedReport} />
      ) : (
        <ReportKanban reports={filteredReports} onSelect={setSelectedReport} />
      )}

      {/* Report Detail Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedReport && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedReport.title}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {selectedReport.input_assets.map(ticker => (
                    <Badge key={ticker} variant="secondary">${ticker}</Badge>
                  ))}
                  <Badge variant="outline">{selectedReport.horizon}</Badge>
                  {selectedReport.rating && (
                    <Badge className={cn("uppercase", ratingColors[selectedReport.rating])}>
                      {selectedReport.rating}
                    </Badge>
                  )}
                  <Badge className={cn("capitalize", statusColors[selectedReport.status])}>
                    {selectedReport.status.replace('_', ' ')}
                  </Badge>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {selectedReport.upside_pct_estimate !== null && (
                    <div className="stat-card">
                      <div className="text-xs text-muted-foreground mb-1">Upside</div>
                      <span className={cn("font-bold", selectedReport.upside_pct_estimate >= 0 ? "text-gain" : "text-loss")}>
                        {selectedReport.upside_pct_estimate >= 0 ? '+' : ''}{selectedReport.upside_pct_estimate}%
                      </span>
                    </div>
                  )}
                  {selectedReport.score_6m !== null && (
                    <div className="stat-card">
                      <div className="text-xs text-muted-foreground mb-1">6M Score</div>
                      <span className="font-bold">{selectedReport.score_6m}/10</span>
                    </div>
                  )}
                  {selectedReport.score_12m !== null && (
                    <div className="stat-card">
                      <div className="text-xs text-muted-foreground mb-1">12M Score</div>
                      <span className="font-bold">{selectedReport.score_12m}/10</span>
                    </div>
                  )}
                  {selectedReport.score_long_term !== null && (
                    <div className="stat-card">
                      <div className="text-xs text-muted-foreground mb-1">LT Score</div>
                      <span className="font-bold">{selectedReport.score_long_term}/10</span>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-accent/50 rounded-lg">
                  <h4 className="font-semibold mb-2">Summary</h4>
                  <p className="text-sm">{selectedReport.summary}</p>
                </div>

                <div className="flex gap-2">
                  <Select value={selectedReport.rating || ''} onValueChange={handleRatingChange}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Rating" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="hold">Hold</SelectItem>
                      <SelectItem value="avoid">Avoid</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedReport.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="to_review">To Review</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
