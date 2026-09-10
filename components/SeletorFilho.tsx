"use client";

// Chips "de quem é esta despesa": um filho, ou "todos" (despesa da casa,
// mercado da família). `valor` null = todos; undefined = ainda não escolhido.

import Link from "next/link";
import type { FilhoAtual } from "@/lib/types";

export default function SeletorFilho({
  filhos,
  valor,
  onChange,
  rotulo = "De quem é?",
}: {
  filhos: FilhoAtual[];
  valor: string | null | undefined;
  onChange: (v: string | null) => void;
  rotulo?: string;
}) {
  return (
    <section aria-labelledby="lbl-filho">
      <div className="mb-2 flex items-baseline justify-between">
        <span id="lbl-filho" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {rotulo}
        </span>
        <Link href="/filhos" className="text-xs font-medium text-accent">
          filhos ›
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {filhos.map((f) => {
          const sel = valor === f.linhagem;
          return (
            <button
              key={f.linhagem}
              type="button"
              onClick={() => onChange(f.linhagem)}
              aria-pressed={sel}
              className={["h-10 rounded-xl border px-3 text-sm font-semibold", sel ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink"].join(" ")}
            >
              {f.nome}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={valor === null}
          className={["h-10 rounded-xl border px-3 text-sm font-semibold", valor === null ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink-2"].join(" ")}
        >
          {filhos.length > 1 ? "todos" : "da família"}
        </button>
      </div>
      {valor === undefined && <p className="mt-1 text-[11px] text-ink-3">Toque no nome. "Todos" é para o que é da casa ou de todos os filhos juntos.</p>}
    </section>
  );
}
