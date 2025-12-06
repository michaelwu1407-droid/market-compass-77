import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TraderCard } from '@/components/traders/TraderCard';
import { traders, followedTraderIds } from '@/data/mockData';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

type TraderFilter = 'trending' | 'most_copied' | 'following';

export default function TradersPage() {
  const [filter, setFilter] = useState<TraderFilter>('trending');
  const [minTrackRecord, setMinTrackRecord] = useState('12m');
  const [maxRisk, setMaxRisk] = useState([7]);
  const [followingIds, setFollowingIds] = useState<string[]>(followedTraderIds);
  const navigate = useNavigate();

  const handleFollow = (traderId: string) => {
    setFollowingIds(prev => 
      prev.includes(traderId) 
        ? prev.filter(id => id !== traderId)
        : [...prev, traderId]
    );
  };

  const handleAnalyse = (traderId: string) => {
    navigate('/analysis');
  };

  const handleStarForIC = (traderId: string) => {
    navigate('/ic');
  };

  const handleTraderClick = (traderId: string) => {
    navigate(`/traders/${traderId}`);
  };

  // Filter traders
  let filteredTraders = [...traders];
  
  if (filter === 'following') {
    filteredTraders = filteredTraders.filter(t => followingIds.includes(t.id));
  } else if (filter === 'most_copied') {
    filteredTraders = filteredTraders.sort((a, b) => b.num_copiers - a.num_copiers);
  }

  filteredTraders = filteredTraders.filter(t => t.risk_score <= maxRisk[0]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Copy Traders</h1>
        <p className="text-muted-foreground">Discover and analyse top investor profiles</p>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as TraderFilter)}>
          <TabsList>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="most_copied">Most Copied</TabsTrigger>
            <TabsTrigger value="following">Following ({followingIds.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-card rounded-lg border border-border">
        <div className="space-y-2">
          <Label className="text-xs">Minimum Track Record</Label>
          <Select value={minTrackRecord} onValueChange={setMinTrackRecord}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6m">6 months</SelectItem>
              <SelectItem value="12m">12 months</SelectItem>
              <SelectItem value="24m">24 months</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Max Risk Score: {maxRisk[0]}</Label>
          <Slider 
            value={maxRisk} 
            onValueChange={setMaxRisk}
            max={10}
            min={1}
            step={1}
            className="mt-3"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Strategy Tags</Label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="All strategies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="value">Value</SelectItem>
              <SelectItem value="dividends">Dividends</SelectItem>
              <SelectItem value="momentum">Momentum</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trader Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTraders.map((trader) => (
          <TraderCard
            key={trader.id}
            trader={trader}
            isFollowing={followingIds.includes(trader.id)}
            onFollow={() => handleFollow(trader.id)}
            onAnalyse={() => handleAnalyse(trader.id)}
            onStarForIC={() => handleStarForIC(trader.id)}
            onClick={() => handleTraderClick(trader.id)}
          />
        ))}
      </div>

      {filteredTraders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No traders match your filters</p>
        </div>
      )}
    </div>
  );
}
