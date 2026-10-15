import { PHOTO_BUCKET, SUPABASE_CONFIGURED, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.js';
import { createClient } from '@supabase/supabase-js';

let clientPromise;

export async function getSupabaseClient() {
  if (!SUPABASE_CONFIGURED) return null;
  clientPromise ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return clientPromise;
}

export { PHOTO_BUCKET, SUPABASE_CONFIGURED };
