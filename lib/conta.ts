// Conta: entrar por e-mail + código de 6 dígitos (sem senha). O código chega
// por e-mail; funciona em qualquer navegador, sem depender de link abrir no
// mesmo aparelho.

import { contaConfigurada, supabase } from "./supabase";

export interface Sessao {
  id: string;
  email: string;
}

export async function sessaoAtual(): Promise<Sessao | null> {
  if (!contaConfigurada()) return null;
  const { data } = await supabase().auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? "" } : null;
}

export async function pedirCodigo(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function confirmarCodigo(email: string, codigo: string): Promise<Sessao> {
  const { data, error } = await supabase().auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: codigo.replace(/\D/g, ""),
    type: "email",
  });
  if (error || !data.user) throw error ?? new Error("codigo_invalido");
  return { id: data.user.id, email: data.user.email ?? "" };
}

export async function sair(): Promise<void> {
  await supabase().auth.signOut();
}

/** Chama `cb` agora e sempre que a sessão mudar (login, logout, outro guia). */
export function aoMudarSessao(cb: (s: Sessao | null) => void): () => void {
  if (!contaConfigurada()) {
    cb(null);
    return () => {};
  }
  sessaoAtual().then(cb);
  const { data } = supabase().auth.onAuthStateChange((_ev, sessao) => {
    const u = sessao?.user;
    cb(u ? { id: u.id, email: u.email ?? "" } : null);
  });
  return () => data.subscription.unsubscribe();
}
