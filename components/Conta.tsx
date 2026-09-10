"use client";

// Conta: entrar (e-mail + código), ver o estado da sincronização, sair.

import { useEffect, useState } from "react";
import Link from "next/link";
import { aoMudarSessao, confirmarCodigo, pedirCodigo, sair, type Sessao } from "@/lib/conta";
import { contaConfigurada } from "@/lib/supabase";
import { observarSync, sincronizar, type EstadoSync } from "@/lib/sync";
import { formatDataHora } from "@/lib/format";

export default function Conta() {
  const configurada = contaConfigurada();
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined);
  const [sync, setSync] = useState<EstadoSync | null>(null);

  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"email" | "codigo">("email");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => aoMudarSessao(setSessao), []);
  useEffect(() => observarSync(setSync), []);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  async function enviarCodigo() {
    if (!emailOk) return;
    setOcupado(true);
    setErro(null);
    try {
      await pedirCodigo(email);
      setEtapa("codigo");
    } catch {
      setErro("Não consegui enviar o código. Confira o e-mail e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function entrar() {
    if (codigo.replace(/\D/g, "").length < 6) return;
    setOcupado(true);
    setErro(null);
    try {
      await confirmarCodigo(email, codigo);
      setCodigo("");
      setEtapa("email");
      void sincronizar();
    } catch {
      setErro("Código inválido ou vencido. Peça um novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function sairDaConta() {
    setOcupado(true);
    try {
      await sair();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">Conta</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-10 pt-4">
        {!configurada && (
          <p className="rounded-2xl border border-rule bg-surface px-4 py-4 text-sm text-ink-3">
            A conta na nuvem ainda não foi configurada neste site (faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY). Por
            enquanto o cofre fica só neste aparelho.
          </p>
        )}

        {configurada && sessao === undefined && <p className="py-10 text-center text-sm text-ink-3">Verificando…</p>}

        {configurada && sessao === null && (
          <>
            <section className="rounded-2xl border border-rule bg-surface px-4 py-4 text-sm text-ink-2">
              <p>
                Com uma conta, cada registro e comprovante ganha uma cópia na nuvem, e o cofre aparece igual em qualquer aparelho ou
                navegador. Na nuvem <strong>nada pode ser alterado ou apagado</strong> — só acrescentado. É também o que vai permitir
                convidar o advogado.
              </p>
              <p className="mt-2 text-xs text-ink-3">Sem senha: você recebe um código de 6 dígitos por e-mail a cada entrada.</p>
            </section>

            {etapa === "email" ? (
              <section className="space-y-3">
                <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Seu e-mail
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={enviarCodigo}
                  disabled={!emailOk || ocupado}
                  className="h-12 w-full rounded-2xl bg-accent text-base font-semibold text-white disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
                >
                  {ocupado ? "Enviando…" : "Enviar código"}
                </button>
              </section>
            ) : (
              <section className="space-y-3">
                <p className="text-sm text-ink-2">
                  Enviamos um código para <strong>{email.trim()}</strong>. Pode levar um minuto; olhe também o spam.
                </p>
                <label htmlFor="codigo" className="block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Código de 6 dígitos
                </label>
                <input
                  id="codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="000000"
                  className="tnum h-14 w-full rounded-2xl border border-rule bg-surface px-4 text-center text-2xl font-semibold tracking-[0.3em] outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={entrar}
                  disabled={codigo.replace(/\D/g, "").length < 6 || ocupado}
                  className="h-12 w-full rounded-2xl bg-accent text-base font-semibold text-white disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
                >
                  {ocupado ? "Entrando…" : "Entrar"}
                </button>
                <div className="flex justify-between text-sm font-medium text-accent">
                  <button type="button" onClick={() => setEtapa("email")}>
                    Trocar e-mail
                  </button>
                  <button type="button" onClick={enviarCodigo} disabled={ocupado}>
                    Reenviar código
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {configurada && sessao && (
          <>
            <section className="rounded-2xl border border-rule bg-surface px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Conectada como</p>
              <p className="mt-0.5 break-all text-sm font-semibold">{sessao.email}</p>
            </section>

            <section className="rounded-2xl border border-rule bg-surface px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Sincronização</p>
              <p className="mt-1 text-sm">
                {sync?.estado === "sincronizando" && "Sincronizando…"}
                {sync?.estado === "ok" && "Tudo na nuvem."}
                {sync?.estado === "erro" && <span className="text-risk">Não consegui sincronizar. Verifique a conexão.</span>}
                {sync?.estado === "deslogado" && "Aguardando…"}
              </p>
              {sync?.pendentes ? <p className="mt-0.5 text-xs text-ink-3">{sync.pendentes} registro(s) ainda só neste aparelho</p> : null}
              {sync?.ultima && <p className="mt-0.5 text-xs text-ink-3">Última vez: {formatDataHora(sync.ultima)}</p>}
              {sync?.estado === "erro" && sync.detalhe && <p className="mt-1 break-all font-mono text-[10px] text-ink-3">{sync.detalhe}</p>}
              <button
                type="button"
                onClick={() => void sincronizar()}
                disabled={sync?.estado === "sincronizando"}
                className="mt-3 h-11 w-full rounded-xl border border-accent bg-surface text-sm font-semibold text-accent disabled:border-rule disabled:text-ink-3 active:bg-accent-soft"
              >
                Sincronizar agora
              </button>
            </section>

            <section>
              <button
                type="button"
                onClick={sairDaConta}
                disabled={ocupado}
                className="h-11 w-full rounded-xl text-sm font-medium text-risk active:bg-risk-soft"
              >
                Sair da conta neste aparelho
              </button>
              <p className="mt-1 text-center text-[11px] text-ink-3">
                Os registros já feitos continuam neste aparelho e na nuvem. Sair só desliga a sincronização aqui.
              </p>
            </section>
          </>
        )}

        {erro && (
          <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {erro}
          </p>
        )}
      </main>
    </div>
  );
}
