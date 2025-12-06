import { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { ReportType, Horizon } from '@/types';

interface AnalysisInputProps {
  onSubmit: (data: {
    reportType: ReportType;
    assets: string[];
    traderIds: string[];
    horizon: Horizon;
    extraInstructions: string;
    outputMode: 'quick' | 'full';
  }) => void;
  isLoading?: boolean;
}

export function AnalysisInput({ onSubmit, isLoading }: AnalysisInputProps) {
  const [reportType, setReportType] = useState<ReportType>('single_stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [selectedTraders, setSelectedTraders] = useState<string[]>([]);
  const [horizon, setHorizon] = useState<Horizon>('12m');
  const [extraInstructions, setExtraInstructions] = useState('');
  const [outputMode, setOutputMode] = useState<'quick' | 'full'>('quick');

  const handleSubmit = () => {
    // For demo, use search query as asset/trader selection
    const assets = reportType !== 'trader_portfolio' ? [searchQuery.toUpperCase()] : [];
    const traders = reportType === 'trader_portfolio' ? [searchQuery] : [];
    
    onSubmit({
      reportType,
      assets,
      traderIds: traders,
      horizon,
      extraInstructions,
      outputMode,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Analysis Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Report Type */}
        <div className="space-y-2">
          <Label>Analysis Type</Label>
          <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
            <TabsList className="w-full">
              <TabsTrigger value="single_stock" className="flex-1">Single Stock</TabsTrigger>
              <TabsTrigger value="trader_portfolio" className="flex-1">Trader Portfolio</TabsTrigger>
              <TabsTrigger value="basket" className="flex-1">Basket</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Search Input */}
        <div className="space-y-2">
          <Label>
            {reportType === 'trader_portfolio' ? 'Search Trader' : 'Search Ticker(s)'}
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={reportType === 'trader_portfolio' ? 'e.g. JayMedrow' : 'e.g. NVDA, AAPL'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Horizon */}
        <div className="space-y-2">
          <Label>Investment Horizon</Label>
          <RadioGroup 
            value={horizon} 
            onValueChange={(v) => setHorizon(v as Horizon)}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="6m" id="horizon-6m" />
              <Label htmlFor="horizon-6m" className="cursor-pointer">6 months</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="12m" id="horizon-12m" />
              <Label htmlFor="horizon-12m" className="cursor-pointer">12 months</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="long_term" id="horizon-lt" />
              <Label htmlFor="horizon-lt" className="cursor-pointer">Long term</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Extra Instructions */}
        <div className="space-y-2">
          <Label>Extra Instructions (Optional)</Label>
          <Textarea
            placeholder="Add specific questions or focus areas..."
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            className="min-h-[80px]"
          />
        </div>

        {/* Output Mode */}
        <div className="space-y-2">
          <Label>Output Mode</Label>
          <div className="grid grid-cols-3 gap-3">
            <Button
              type="button"
              variant={outputMode === 'quick' ? 'default' : 'outline'}
              className="h-auto py-3 px-4 flex flex-col gap-1"
              onClick={() => setOutputMode('quick')}
            >
              <span className="font-medium">Quick Take</span>
              <span className="text-xs opacity-70">Bullet summary</span>
            </Button>
            <Button
              type="button"
              variant={outputMode === 'full' ? 'default' : 'outline'}
              className="h-auto py-3 px-4 flex flex-col gap-1"
              onClick={() => setOutputMode('full')}
            >
              <span className="font-medium">Full IC Paper</span>
              <span className="text-xs opacity-70">Detailed report</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto py-3 px-4 flex flex-col gap-1 opacity-50"
              disabled
            >
              <span className="font-medium">Compare</span>
              <span className="text-xs opacity-70">Coming soon</span>
            </Button>
          </div>
        </div>

        {/* Submit */}
        <Button 
          onClick={handleSubmit} 
          className="w-full" 
          size="lg"
          disabled={!searchQuery || isLoading}
        >
          {isLoading ? (
            <>
              <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
              Analysing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Run Analysis
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
