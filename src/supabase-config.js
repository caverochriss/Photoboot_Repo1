// Sustituye estos dos valores por la URL y la publishable key del proyecto Supabase.
// La publishable key puede estar en el navegador si las tablas y el bucket usan RLS.
export const SUPABASE_URL = 'https://decfpacodpbcjwrdenwx.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EUgZbz6QEGPfM1uMV5TYoQ_klNrEKUj';

export const SUPABASE_CONFIGURED =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('TU-PROYECTO') &&
  !SUPABASE_PUBLISHABLE_KEY.includes('TU_CLAVE');

export const PHOTO_BUCKET = 'photobooth';
