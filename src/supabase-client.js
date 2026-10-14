import { PHOTO_BUCKET, SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.js';

let clientPromise;

export async function getSupabaseClient() {
  if (!SUPABASE_CONFIGURED) return null;
  // Versión fijada para que esta página estática no cambie de SDK sin revisión.
  clientPromise ??= import('https://esm.sh/@supabase/supabase-js@2.117.3').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return clientPromise;
}

export { PHOTO_BUCKET, SUPABASE_CONFIGURED };
