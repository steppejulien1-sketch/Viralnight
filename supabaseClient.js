import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("https://") &&
    supabaseUrl.includes(".supabase.co"),
);

function preconnectSupabase(url) {
  if (!isSupabaseConfigured || typeof document === "undefined") return;

  const origin = new URL(url).origin;
  const selector = `link[rel="preconnect"][href="${origin}"]`;

  if (document.head.querySelector(selector)) return;

  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  link.crossOrigin = "";
  document.head.append(link);
}

preconnectSupabase(supabaseUrl);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
