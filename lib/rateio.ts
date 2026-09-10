// Rateio: quando só uma parte da despesa é do filho.
//
// valor_centavos da Despesa = parte do filho. O comprovante mostra o total.
// A proporção é DECLARADA por quem lança e fica gravada com o critério —
// o app não decide se o rateio é justo; isso é conversa entre cliente e advogado.

import type { Rateio } from "./types";

/** Percentuais de um toque. 100 = sem rateio. */
export const PERCENTUAIS_RAPIDOS: Array<{ valor: number; rotulo: string; dica: string }> = [
  { valor: 50, rotulo: "50%", dica: "metade" },
  { valor: 33.33, rotulo: "⅓", dica: "1 de 3 pessoas" },
  { valor: 25, rotulo: "25%", dica: "1 de 4 pessoas" },
  { valor: 20, rotulo: "20%", dica: "1 de 5 pessoas" },
];

/** Parte do filho, em centavos, arredondada ao centavo. */
export function parteDoFilho(totalCentavos: number, percentual: number): number {
  return Math.round((totalCentavos * percentual) / 100);
}

/** "33.33" -> 33.33; aceita vírgula; fora de (0, 100] devolve null. */
export function parsePercentual(texto: string): number | null {
  const n = Number(texto.replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

export function formatPercentual(p: number): string {
  if (Math.abs(p - 33.33) < 0.01) return "⅓";
  if (Math.abs(p - 66.67) < 0.01) return "⅔";
  return `${Number.isInteger(p) ? p : p.toFixed(2).replace(".", ",")}%`;
}

/** Texto curto para listas e histórico: "⅓ de R$ 150,00 · 3 pessoas, 1 criança" */
export function descreverRateio(r: Rateio, formatBRL: (c: number) => string): string {
  const base = `${formatPercentual(r.percentual)} de ${formatBRL(r.total_centavos)}`;
  return r.criterio ? `${base} · ${r.criterio}` : base;
}
