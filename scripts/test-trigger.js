(async ()=>{
  try{
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!anonKey) {
      throw new Error('Missing SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) in environment');
    }
    const res = await fetch('https://xgvaibxxiwfraklfbwey.functions.supabase.co/trigger-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`
      },
      body: JSON.stringify({ domains: ['discussion_feed'], triggered_by: 'manual' })
    });

    console.log('status', res.status);
    const text = await res.text();
    console.log(text);
  } catch (err) {
    console.error(err);
  }
})();
