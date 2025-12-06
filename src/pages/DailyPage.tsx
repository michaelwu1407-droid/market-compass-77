import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DailyMoverRow } from '@/components/daily/DailyMoverRow';
import { TraderMoveCard } from '@/components/daily/TraderMoveCard';
import { dailyMovers, trades, followedTraderIds } from '@/data/mockData';
import { format } from 'date-fns';

export default function DailyPage() {
  const [moverFilter, setMoverFilter] = useState('all');
  const navigate = useNavigate();
  const today = new Date();

  // Filter trades from followed traders
  const followedTrades = trades.filter(t => followedTraderIds.includes(t.trader_id));

  const handleAnalyse = (assetId?: string) => {
    navigate('/analysis');
  };

  const handleStarForIC = () => {
    navigate('/ic');
  };

  const handleViewAsset = (assetId: string) => {
    navigate('/analysis');
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero Card */}
      <Card className="mb-6 bg-gradient-to-br from-primary/5 via-transparent to-accent/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Today's Market in One Glance</h1>
              <p className="text-muted-foreground">{format(today, 'EEEE, MMMM d, yyyy')}</p>
            </div>
          </div>
          
          <div className="space-y-2 pl-12">
            <p className="text-sm flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Tech stocks rallied on strong AI infrastructure spending forecasts; NVDA +4.2%, TSLA +6.8%</span>
            </p>
            <p className="text-sm flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Alphabet faced pressure on DOJ antitrust concerns; GOOGL -2.1%</span>
            </p>
            <p className="text-sm flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Your followed traders made 4 significant moves today</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Daily Movers Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Daily Movers
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-2">
            <Tabs value={moverFilter} onValueChange={setMoverFilter}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="watchlist" className="text-xs">Watchlist</TabsTrigger>
                <TabsTrigger value="followed" className="text-xs">Followed Impacted</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <div className="divide-y divide-border">
            {dailyMovers.map((mover) => (
              <DailyMoverRow
                key={mover.id}
                mover={mover}
                onViewAsset={() => handleViewAsset(mover.asset_id)}
                onAnalyse={() => handleAnalyse(mover.asset_id)}
                onStarForIC={handleStarForIC}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Your Traders' Moves */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Your Traders' Moves
          </CardTitle>
        </CardHeader>
        <CardContent>
          {followedTrades.length > 0 ? (
            <div className="space-y-4">
              {followedTrades.map((trade) => (
                <TraderMoveCard key={trade.id} trade={trade} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent trades from traders you follow</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
