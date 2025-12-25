import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; // Assuming you have a Supabase client configured

interface Trader {
  id: string;
  etoro_username: string;
  display_name: string;
  avatar_url: string;
  copiers: number;
  risk_score: number;
}

export function TradersPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTraders = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('traders')
          .select('*')
          .order('copiers', { ascending: false });

        if (error) throw error;
        setTraders(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTraders();
  }, []);

  if (loading) return <div>Loading traders...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Synced Traders</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {traders.map((trader) => (
          <div key={trader.id} className="border p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <img src={trader.avatar_url} alt={trader.display_name} className="w-12 h-12 rounded-full mr-4" />
              <div>
                <h2 className="text-lg font-semibold">{trader.display_name}</h2>
                <p className="text-sm text-gray-500">@{trader.etoro_username}</p>
              </div>
            </div>
            <div className="flex justify-between">
              <div>
                <p className="text-sm font-medium">Copiers</p>
                <p>{trader.copiers}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Risk Score</p>
                <p>{trader.risk_score}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}