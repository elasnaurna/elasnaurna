"use client";

// Cabeçalho da tela inicial: nome, estado da conta, Exportar e as duas abas
// (Despesas = o que sai · Pensão = o que entra).

import { useEffect, useState } from "react";
import Link from "next/link";
import { observarSync, type EstadoSync } from "@/lib/sync";

export type Aba = "despesas" | "pensao";

export default function CabecalhoCofre({ aba }: { aba: Aba }) {
  const [sync, setSync] = useState<EstadoSync | null>(null);
  useEffect(() => observarSync(setSync), []);

  const rotulo =
    !sync || sync.estado === "sem_conta"
      ? "só no seu aparelho"
      : sync.estado === "deslogado"
        ? "entrar na conta"
        : sync.estado === "sincronizando"
          ? "sincronizando…"
          : sync.estado === "erro"
            ? "sem conexão"
            : "na nuvem ✓";

  return (
    <header className="safe-t sticky top-0 z-10 border-b border-rule bg-paper/95 px-4 pb-2 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight">AlimentaProva</h1>
          <Link href="/conta" className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
            {rotulo}
          </Link>
        </div>
        <Link href="/exportar" className="-mr-2 rounded-lg px-2 py-2 text-sm font-semibold text-accent active:bg-rule/50">
          Exportar
        </Link>
      </div>
      <nav className="mt-2 grid grid-cols-2 rounded-xl bg-rule/60 p-0.5 text-sm font-semibold" aria-label="Seções">
        <AbaLink href="/" ativa={aba === "despesas"}>
          Despesas
        </AbaLink>
        <AbaLink href="/pensao" ativa={aba === "pensao"}>
          Pensão
        </AbaLink>
      </nav>
    </header>
  );
}

function AbaLink({ href, ativa, children }: { href: string; ativa: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={["h-9 rounded-[10px] text-center leading-9", ativa ? "bg-surface text-ink shadow-sm" : "text-ink-3"].join(" ")}
    >
      {children}
    </Link>
  );
}
