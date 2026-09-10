// Índices públicos usados para atualizar atrasados: INPC e IPCA (variação mensal).
//
// Este arquivo é só dados e aritmética (sem navegador, sem rede), para ser
// testável. Os valores embutidos são o "modo avião": o app funciona sem
// internet. A busca no IBGE e o cache ficam em indices-cache.ts; o salário
// mínimo, em salario-minimo.ts.

export type NomeIndice = "INPC" | "IPCA";

/** variação mensal em %, por mês YYYY-MM */
export type SerieMensal = Record<string, number>;

export interface Indices {
  INPC: SerieMensal;
  IPCA: SerieMensal;
  /** quando a série veio do IBGE (ISO); ausente = só o embutido */
  atualizadoEm?: string;
}

// ---------------------------------------------------------------------------
// INPC e IPCA — variação mensal (%), IBGE. Embutido: jan/2019 a jul/2026.
// ---------------------------------------------------------------------------
function serie(inicio: string, valores: number[]): SerieMensal {
  const out: SerieMensal = {};
  let [a, m] = inicio.split("-").map(Number);
  for (const v of valores) {
    out[`${a}-${String(m).padStart(2, "0")}`] = v;
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return out;
}

export const INDICES_EMBUTIDOS: Indices = {
  INPC: serie("2019-01", [
    0.36, 0.54, 0.77, 0.6, 0.15, 0.01, 0.1, 0.12, -0.05, 0.04, 0.54, 1.22, // 2019
    0.19, 0.17, 0.18, -0.23, -0.25, 0.3, 0.44, 0.36, 0.87, 0.89, 0.95, 1.46, // 2020
    0.27, 0.82, 0.86, 0.38, 0.96, 0.6, 1.02, 0.88, 1.2, 1.16, 0.84, 0.73, // 2021
    0.67, 1.0, 1.71, 1.04, 0.45, 0.62, -0.6, -0.31, -0.32, 0.47, 0.38, 0.69, // 2022
    0.46, 0.77, 0.64, 0.53, 0.36, -0.1, -0.09, 0.2, 0.11, 0.12, 0.1, 0.55, // 2023
    0.57, 0.81, 0.19, 0.37, 0.46, 0.25, 0.26, -0.14, 0.48, 0.61, 0.33, 0.48, // 2024
    0.0, 1.48, 0.51, 0.48, 0.35, 0.23, 0.21, -0.21, 0.52, 0.03, 0.03, 0.21, // 2025
    0.39, 0.56, 0.91, 0.81, 0.65, 0.14, -0.01, // 2026 (até jul)
  ]),
  IPCA: serie("2019-01", [
    0.32, 0.43, 0.75, 0.57, 0.13, 0.01, 0.19, 0.11, -0.04, 0.1, 0.51, 1.15, // 2019
    0.21, 0.25, 0.07, -0.31, -0.38, 0.26, 0.36, 0.24, 0.64, 0.86, 0.89, 1.35, // 2020
    0.25, 0.86, 0.93, 0.31, 0.83, 0.53, 0.96, 0.87, 1.16, 1.25, 0.95, 0.73, // 2021
    0.54, 1.01, 1.62, 1.06, 0.47, 0.67, -0.68, -0.36, -0.29, 0.59, 0.41, 0.62, // 2022
    0.53, 0.84, 0.71, 0.61, 0.23, -0.08, 0.12, 0.23, 0.26, 0.24, 0.28, 0.56, // 2023
    0.42, 0.83, 0.16, 0.38, 0.46, 0.21, 0.38, -0.02, 0.44, 0.56, 0.39, 0.52, // 2024
    0.16, 1.31, 0.56, 0.43, 0.26, 0.24, 0.26, -0.11, 0.48, 0.09, 0.18, 0.33, // 2025
    0.33, 0.7, 0.88, 0.67, 0.58, 0.16, 0.07, // 2026 (até jul)
  ]),
};

/** Último mês com valor numa série (YYYY-MM). */
export function ultimoMes(s: SerieMensal): string | null {
  const ks = Object.keys(s).sort();
  return ks.length ? ks[ks.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Aritmética de correção
// ---------------------------------------------------------------------------

/**
 * Fator de correção monetária de um valor vencido no mês `de`, trazido para o
 * mês `ate`: produto de (1 + variação/100) de `de` até o mês ANTERIOR a `ate`
 * (o índice do mês corrente ainda não foi divulgado). Meses sem índice
 * disponível entram como 1 e são devolvidos em `semIndice`, para a memória de
 * cálculo dizer o que faltou.
 */
export function fatorCorrecao(s: SerieMensal, de: string, ate: string): { fator: number; semIndice: string[] } {
  let fator = 1;
  const semIndice: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [aF, mF] = ate.split("-").map(Number);
  let guarda = 0;
  while ((a < aF || (a === aF && m < mF)) && guarda++ < 600) {
    const k = `${a}-${String(m).padStart(2, "0")}`;
    const v = s[k];
    if (v === undefined) semIndice.push(k);
    else fator *= 1 + v / 100;
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return { fator, semIndice };
}

/** Dias corridos entre duas datas YYYY-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
