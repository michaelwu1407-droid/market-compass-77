// Minimal type shims so the VS Code TypeScript service can typecheck Supabase Edge Functions.
// These functions run on Deno, not in the Vite/React build.

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  // Keep this loose; runtime is Deno.
  export const createClient: any;
}
