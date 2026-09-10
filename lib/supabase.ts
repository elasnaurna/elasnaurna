// Cliente do Supabase. Sem NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY o app segue
// só no aparelho, como antes — nada quebra. A chave "anon" é pública por
// desenho: quem manda é a RLS no banco (ver supabase/schema.sql).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function contaConfigurada(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabase(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) throw new Error("conta_nao_configurada");
    cliente = createClient(url, chave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return cliente;
}
