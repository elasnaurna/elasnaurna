"use client";

// Painel de rateio: "só uma parte desta despesa é do meu filho".
// Usado na captura (modo único) e na edição. Não decide nada — registra.

import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { PERCENTUAIS_RAPIDOS, formatPercentual, parsePercentual, parteDoFilho } from "@/lib/rateio";

interface Props {
  /** total do comprovante (o que está no campo Valor), ou null se inválido */
  totalCentavos: number | null;
  ativo: boolean;
  percentual: number;
  criterio: string;
  onAtivoChange: (ativo: boolean) => void;
  onPercentualChange: (p: number) => void;
  onCriterioChange: (c: string) => void;
}

export default function RateioPainel({
  totalCentavos,
  ativo,
  percentual,
  criterio,
  onAtivoChange,
  onPercentualChange,
  onCriterioChange,
}: Props) {
  const [percentualTexto, setPercentualTexto] = useState("");
  const ehRapido = PERCENTUAIS_RAPIDOS.some((p) => Math.abs(p.valor - percentual) < 0.01);

  if (!ativo) {
    return (
      <button type="button" onClick={() => onAtivoChange(true)} className="text-left text-sm font-medium text-accent">
        Só uma parte é do meu filho? Dividir
      </button>
    );
  }

  const parte = totalCentavos !== null ? parteDoFilho(totalCentavos, percentual) : null;

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">Parte do filho</span>
        <button
          type="button"
          onClick={() => {
            onAtivoChange(false);
            setPercentualTexto("");
          }}
          className="text-xs font-medium text-ink-3"
        >
          Remover divisão
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERCENTUAIS_RAPIDOS.map((p) => {
          const sel = Math.abs(p.valor - percentual) < 0.01;
          return (
            <button
              key={p.valor}
              type="button"
              onClick={() => {
                onPercentualChange(p.valor);
                setPercentualTexto("");
              }}
              aria-pressed={sel}
              title={p.dica}
              className={[
                "h-10 min-w-[56px] rounded-xl border px-3 text-sm font-semibold",
                sel ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink",
              ].join(" ")}
            >
              {p.rotulo}
            </button>
          );
        })}
        <div
          className={[
            "flex h-10 items-center gap-1 rounded-xl border bg-surface px-3",
            !ehRapido ? "border-accent" : "border-rule",
          ].join(" ")}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="outro"
            aria-label="Percentual do filho"
            value={percentualTexto}
            onChange={(e) => {
              setPercentualTexto(e.target.value);
              const p = parsePercentual(e.target.value);
              if (p !== null) onPercentualChange(p);
            }}
            className="tnum w-14 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-ink-3/60"
          />
          <span className="text-sm text-ink-3">%</span>
        </div>
      </div>

      <input
        type="text"
        value={criterio}
        onChange={(e) => onCriterioChange(e.target.value)}
        placeholder="Como dividiu? Ex.: 3 pessoas na mesa, 1 criança"
        className="mt-3 h-11 w-full rounded-xl border border-rule bg-surface px-3 text-sm outline-none focus:border-accent"
      />

      <p className="mt-3 text-sm">
        {parte !== null && totalCentavos !== null ? (
          <>
            Vai para o cofre: <strong className="tnum">{formatBRL(parte)}</strong>
            <span className="text-ink-3">
              {" "}
              ({formatPercentual(percentual)} de {formatBRL(totalCentavos)})
            </span>
          </>
        ) : (
          <span className="text-ink-3">Preencha o valor total do comprovante acima.</span>
        )}
      </p>
      <p className="mt-1 text-[11px] text-ink-3">O total e o critério ficam gravados junto. Quem avalia a divisão é o advogado.</p>
    </div>
  );
}
