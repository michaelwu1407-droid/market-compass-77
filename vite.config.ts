import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    port: 8080,
    proxy: {
      // Proxy /functions/* to the Supabase Edge Functions host to avoid CORS during local development
      '/functions': {
        target: 'https://xgvaibxxiwfraklfbwey.supabase.co',
        changeOrigin: true,
        secure: true,
      }
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
