// Minimal TS shims so VS Code doesn't error on Supabase Edge Functions.
// These are NOT used at runtime.

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  // Keep this loose to avoid fighting TS over Deno/bundler typings.
  export function createClient(...args: any[]): any;
}
