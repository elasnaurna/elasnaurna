"use client";

// Lista dos filhos: nome, idade, tamanhos. Toque para editar; "＋" para
// cadastrar. Perfis retirados ficam à parte, como tudo no cofre.

import { useEffect, useState } from "react";
import Link from "next/link";
import { idade, listarFilhosComRetirados } from "@/lib/filhos";
import type { FilhoAtual } from "@/lib/types";

export default function Filhos() {
  const [filhos, setFilhos] = useState<FilhoAtual[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const carregar = () => listarFilhosComRetirados().then(setFilhos).catch(() => setErro("Não consegui abrir o cofre neste navegador."));
    carregar();
    window.addEventListener("cofre:sincronizou", carregar);
    return () => window.removeEventListener("cofre:sincronizou", carregar);
  }, []);

  const ativos = (filhos ?? []).filter((f) => !f.retirada);
  const retirados = (filhos ?? []).filter((f) => f.retirada);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">Filhos</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-5 px-4 pb-32 pt-4">
        {erro && <p className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">{erro}</p>}
        {filhos === null && !erro && <p className="py-10 text-center text-sm text-ink-3">Abrindo…</p>}

        {filhos !== null && ativos.length === 0 && (
          <div className="py-10 text-center">
            <h2 className="text-lg font-semibold">Nenhum filho cadastrado</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-ink-2">
              Com o cadastro, cada despesa diz de quem é, e a planilha e o relatório saem separados por filho. Só o nome já basta.
            </p>
          </div>
        )}

        {ativos.length > 0 && (
          <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
            {ativos.map((f) => (
              <ItemFilho key={f.id} f={f} />
            ))}
          </ul>
        )}

        {ativos.length > 0 && (
          <p className="text-[11px] text-ink-3">
            Só o nome e a idade vão para a pasta do advogado. Tamanhos, escola e observações ficam com você.
          </p>
        )}

        {retirados.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Retirados · {retirados.length}</h2>
            <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface opacity-70">
              {retirados.map((f) => (
                <ItemFilho key={f.id} f={f} />
              ))}
            </ul>
          </section>
        )}
      </main>

      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-4 pt-3">
        <Link
          href="/filhos/novo"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-accent/25 active:bg-accent-strong"
        >
          <span className="text-xl leading-none" aria-hidden="true">
            ＋
          </span>
          Cadastrar filho
        </Link>
      </div>
    </div>
  );
}

function ItemFilho({ f }: { f: FilhoAtual }) {
  const anos = idade(f.nascimento);
  const detalhes = [anos, f.roupa ? `roupa ${f.roupa}` : "", f.calcado ? `calçado ${f.calcado}` : "", f.escola].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={`/filhos/${f.linhagem}`} className="flex items-center gap-3 px-4 py-3 active:bg-rule/40">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent" aria-hidden="true">
          {f.nome.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className={["truncate text-sm font-semibold", f.retirada ? "line-through text-ink-3" : ""].join(" ")}>{f.nome}</div>
          {detalhes && <div className="truncate text-xs text-ink-3">{detalhes}</div>}
        </div>
        <span className="text-ink-3" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}
