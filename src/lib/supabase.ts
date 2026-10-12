import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://gyrsdogffesyigspkysy.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5cnNkb2dmZmVzeWlnc3BreXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NTYwNzAsImV4cCI6MjEwNzIzMjA3MH0.X3ApvOahmvR_yuMYA9rBIRsho4iqjZscOABog03IAAI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, ms: number = 4500): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms)
    ),
  ]);
}

