(async ()=>{
  try{
    const res = await fetch('https://xgvaibxxiwfraklfbwey.functions.supabase.co/trigger-sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndmFpYnh4aXdmcmFrbGZid2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzODYwMjcsImV4cCI6MjA4MTk2MjAyN30.6WpGcdGeuFngazeTP5tiwVL--htj7AUqsLsTqW5Iz7M'
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
