import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((_req) => {
  return new Response(JSON.stringify({ hello: "world", public: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
