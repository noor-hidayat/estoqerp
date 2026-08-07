import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

export function createClient() {
  return supabase;
}

export function signUpUser(email: string, password: string, name: string) {
  const tmp = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return tmp.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
}
