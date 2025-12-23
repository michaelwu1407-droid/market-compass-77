import { useState, useEffect } from 'react';
import { Search, Sparkles, Check, ChevronsUpDown, User, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTraders } from '@/hooks/useTraders';
import { useAnalysisTemplates, type AnalysisTemplate } from '@/hooks/useAnalysisTemplates';
import type { ReportType, Horizon } from '@/types';

interface PreselectedTrader {
  id: string;
  display_name: string;
  etoro_username: string;
  avatar_url: string | null;
}

interface AnalysisInputProps {
  onSubmit: (data: {
    reportType: ReportType;
    assets: string[];
    traderIds: string[];
    horizon: Horizon;
    extraInstructions: string;
    outputMode: 'quick' | 'full';
    templateId?: string;
  }) => void;
  isLoading?: boolean;
  preselectedTrader?: PreselectedTrader;
  preselectedAsset?: string;
}

export function AnalysisInput({ onSubmit, isLoading, preselectedTrader, preselectedAsset }: AnalysisInputProps) {
  const [reportType, setReportType] = useState<ReportType>('single_stock');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [selectedTraders, setSelectedTraders] = useState<string[]>([]);
  const [selectedTraderDisplay, setSelectedTraderDisplay] = useState<string>('');
  const [horizon, setHorizon] = useState<Horizon>('12m');
  const [extraInstructions, setExtraInstructions] = useState('');
  const [outputMode, setOutputMode] = useState<'quick' | 'full'>('quick');
  const [traderSearchOpen, setTraderSearchOpen] = useState(false);
  const [traderSearchQuery, setTraderSearchQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const { data: traders, isLoading: tradersLoading } = useTraders();
  const { data: templates } = useAnalysisTemplates();

  // Handle preselected trader
  useEffect(() => {
    if (preselectedTrader) {
      setReportType('trader_portfolio');
      setSelectedTraders([preselectedTrader.id]);
      setSelectedTraderDisplay(preselectedTrader.display_name);
      setSearchQuery(preselectedTrader.etoro_username);
    }
  }, [preselectedTrader]);

  // Handle preselected asset
  useEffect(() => {
    if (preselectedAsset) {
      setReportType('single_stock');
      setSearchQuery(preselectedAsset.toUpperCase());
    }
  }, [preselectedAsset]);

  const handleSubmit = () => {
    // For stock analysis, use search query
    const assets = reportType !== 'trader_portfolio' ? [searchQuery.toUpperCase()] : [];
    // For trader analysis, use selected trader ID
    const tradersToUse = reportType === 'trader_portfolio' ? selectedTraders : [];
    
    onSubmit({
      reportType,
      assets,
      traderIds: tradersToUse,
      horizon,
      extraInstructions,
      outputMode,
      templateId: selectedTemplateId || undefined,
    });
  };

  const handleTraderSelect = (traderId: string) => {
    const trader = traders?.find(t => t.id === traderId);
    if (trader) {
      setSelectedTraders([traderId]);
      setSelectedTraderDisplay(trader.display_name);
      setSearchQuery(trader.etoro_username);
    }
    setTraderSearchOpen(false);
  };

  const filteredTraders = traders?.filter(trader => {
    if (!traderSearchQuery) return true;
    const query = traderSearchQuery.toLowerCase();
    return (
      trader.display_name.toLowerCase().includes(query) ||
      trader.etoro_username.toLowerCase().includes(query)
    );
  }).slice(0, 10) || [];

  const isTraderMode = reportType === 'trader_portfolio';

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
            {isTraderMode ? 'Search Trader' : 'Search Ticker(s)'}
          </Label>
          
          {isTraderMode ? (
            <Popover open={traderSearchOpen} onOpenChange={setTraderSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={traderSearchOpen}
                  className="w-full justify-between font-normal h-10"
                >
                  {selectedTraderDisplay ? (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {selectedTraderDisplay}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Select a trader...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Search traders..." 
                    value={traderSearchQuery}
                    onValueChange={setTraderSearchQuery}
                  />
                  <CommandList>
                    {tradersLoading ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Loading traders...
                      </div>
                    ) : filteredTraders.length === 0 ? (
                      <CommandEmpty>No traders found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredTraders.map((trader) => (
                          <CommandItem
                            key={trader.id}
                            value={trader.id}
                            onSelect={handleTraderSelect}
                            className="flex items-center gap-3 p-2"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={trader.avatar_url || undefined} />
                              <AvatarFallback>
                                {trader.display_name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{trader.display_name}</div>
                              <div className="text-xs text-muted-foreground">@{trader.etoro_username}</div>
                            </div>
                            {trader.gain_12m !== null && trader.gain_12m !== undefined && (
                              <span className={cn(
                                "text-xs font-medium",
                                trader.gain_12m >= 0 ? "text-gain" : "text-loss"
                              )}>
                                {trader.gain_12m >= 0 ? '+' : ''}{trader.gain_12m.toFixed(1)}%
                              </span>
                            )}
                            <Check
                              className={cn(
                                "h-4 w-4",
                                selectedTraders.includes(trader.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="e.g. NVDA, AAPL"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          )}
        </div>

        {/* Template Selector */}
        {templates && templates.length > 0 && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Analysis Template
            </Label>
            <Select value={selectedTemplateId || "none"} onValueChange={(v) => setSelectedTemplateId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No template</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex flex-col">
                      <span>{template.name}</span>
                      {template.description && (
                        <span className="text-xs text-muted-foreground">{template.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

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
          disabled={(!searchQuery && selectedTraders.length === 0) || isLoading}
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