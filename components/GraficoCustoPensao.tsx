"use client";

// Gráfico custo do filho × pensão, mês a mês. Colunas agrupadas (mesma
// unidade, um eixo só) + marca do valor combinado. Toque num mês para ver os
// números; a tabela mês a mês fica logo abaixo, na tela.
//
// Cores validadas (CVD/contraste) para fundo claro:
//   custo #2c63b3 · pensão recebida #c76b00 · combinado = tinta (não é série).

import { useState } from "react";
import type { PontoCustoPensao } from "@/lib/pensao";
import { formatBRL } from "@/lib/format";

const COR_CUSTO = "#2c63b3";
const COR_PENSAO = "#c76b00";
const COR_COMBINADO = "#3b4859";
const COR_TINTA_2 = "#6b788a";
const COR_GRADE = "#d9dee6";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloMes(m: string, comAno: boolean): string {
  const [a, mm] = m.split("-");
  const nome = MESES[Number(mm) - 1] ?? mm;
  return comAno ? `${nome}/${a.slice(2)}` : nome;
}

function compacto(centavos: number): string {
  const v = centavos / 100;
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Teto "redondo" para o eixo: 1, 2, 2.5, 5 × 10^n acima do máximo. */
function tetoBonito(max: number): number {
  if (max <= 0) return 100;
  const pot = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * pot >= max) return f * pot;
  return 10 * pot;
}

export default function GraficoCustoPensao({ serie, altura = 190 }: { serie: PontoCustoPensao[]; altura?: number }) {
  const [sel, setSel] = useState<number | null>(null);
  if (serie.length === 0) return null;

  const W = 360;
  const H = altura;
  const mL = 40;
  const mR = 8;
  const mT = 16;
  const mB = 22;
  const plotW = W - mL - mR;
  const plotH = H - mT - mB;
  const n = serie.length;
  const banda = plotW / n;
  const larg = Math.max(4, Math.min(24, (banda - 8) / 2 - 1));
  const teto = tetoBonito(Math.max(...serie.map((p) => Math.max(p.custo, p.recebido, p.devido ?? 0))));
  const y = (v: number) => mT + plotH - (v / teto) * plotH;
  const temCombinado = serie.some((p) => p.devido !== null);
  const variosAnos = new Set(serie.map((p) => p.mes.slice(0, 4))).size > 1;
  const ativo = sel ?? n - 1;
  const p = serie[ativo];

  // coluna: topo arredondado (4px), base reta
  const coluna = (x: number, v: number, cor: string, apagada: boolean) => {
    if (v <= 0) return null;
    const yT = y(v);
    const h = mT + plotH - yT;
    const r = Math.min(4, h, larg / 2);
    const d = `M${x},${mT + plotH} V${yT + r} Q${x},${yT} ${x + r},${yT} H${x + larg - r} Q${x + larg},${yT} ${x + larg},${yT + r} V${mT + plotH} Z`;
    return <path d={d} fill={cor} opacity={apagada ? 0.4 : 1} />;
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_CUSTO }} aria-hidden="true" />
          Custo do filho
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_PENSAO }} aria-hidden="true" />
          Pensão recebida
        </span>
        {temCombinado && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3" style={{ background: COR_COMBINADO }} aria-hidden="true" />
            Combinado
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Custo do filho e pensão recebida por mês" style={{ display: "block" }}>
        {/* grade: 0, metade, teto */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={mL} x2={W - mR} y1={y(teto * f)} y2={y(teto * f)} stroke={COR_GRADE} strokeWidth={1} />
            <text x={mL - 6} y={y(teto * f) + 3.5} textAnchor="end" fontSize={10} fill={COR_TINTA_2}>
              {f === 0 ? "0" : compacto(teto * f)}
            </text>
          </g>
        ))}

        {serie.map((pt, i) => {
          const x0 = mL + i * banda;
          const centro = x0 + banda / 2;
          const xC = centro - larg - 1;
          const xP = centro + 1;
          const apagada = sel !== null && sel !== i;
          return (
            <g key={pt.mes}>
              {i === ativo && <rect x={x0 + 1} y={mT - 4} width={banda - 2} height={plotH + 4} fill={COR_GRADE} opacity={0.35} rx={4} />}
              {coluna(xC, pt.custo, COR_CUSTO, apagada)}
              {coluna(xP, pt.recebido, COR_PENSAO, apagada)}
              {pt.devido !== null && pt.devido > 0 && (
                <line x1={x0 + 4} x2={x0 + banda - 4} y1={y(pt.devido)} y2={y(pt.devido)} stroke={COR_COMBINADO} strokeWidth={2} strokeLinecap="round" opacity={apagada ? 0.4 : 1} />
              )}
              <text x={centro} y={H - 7} textAnchor="middle" fontSize={10} fill={i === ativo ? "#121a25" : COR_TINTA_2} fontWeight={i === ativo ? 600 : 400}>
                {rotuloMes(pt.mes, variosAnos && (i === 0 || pt.mes.endsWith("-01")))}
              </text>
              {/* alvo de toque: a banda inteira */}
              <rect x={x0} y={0} width={banda} height={H} fill="transparent" onClick={() => setSel(i === sel ? null : i)} style={{ cursor: "pointer" }} />
            </g>
          );
        })}
      </svg>

      <p className="tnum mt-1 text-[11px] text-ink-2">
        <span className="font-semibold text-ink">{rotuloMes(p.mes, true)}</span> · custo {formatBRL(p.custo)} · pensão {formatBRL(p.recebido)}
        {p.devido !== null && <> · combinado {formatBRL(p.devido)}</>}
        {p.custo > p.recebido && <> · <span className="text-ink-3">diferença {formatBRL(p.custo - p.recebido)}</span></>}
      </p>
    </div>
  );
}
