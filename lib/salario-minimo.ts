// Salário mínimo nacional — vigência (YYYY-MM) e valor. Fonte: decretos
// federais. É decreto anual: atualizar em janeiro (uma linha). Usado quando a
// pensão foi fixada em % do mínimo.

export const SALARIO_MINIMO: Array<{ desde: string; valor_centavos: number; norma: string }> = [
  { desde: "2017-01", valor_centavos: 93700, norma: "Decreto 8.948/2016" },
  { desde: "2018-01", valor_centavos: 95400, norma: "Decreto 9.255/2017" },
  { desde: "2019-01", valor_centavos: 99800, norma: "Decreto 9.661/2019" },
  { desde: "2020-01", valor_centavos: 103900, norma: "MP 916/2019" },
  { desde: "2020-02", valor_centavos: 104500, norma: "MP 919/2020" },
  { desde: "2021-01", valor_centavos: 110000, norma: "MP 1.021/2020" },
  { desde: "2022-01", valor_centavos: 121200, norma: "MP 1.091/2021" },
  { desde: "2023-01", valor_centavos: 130200, norma: "MP 1.143/2022" },
  { desde: "2023-05", valor_centavos: 132000, norma: "Lei 14.663/2023" },
  { desde: "2024-01", valor_centavos: 141200, norma: "Decreto 11.864/2023" },
  { desde: "2025-01", valor_centavos: 151800, norma: "Decreto 12.342/2024" },
  { desde: "2026-01", valor_centavos: 162100, norma: "Decreto 12.797/2025" },
];

/** Salário mínimo vigente no mês (YYYY-MM), ou null se anterior à tabela. */
export function salarioMinimoEm(mes: string): { valor_centavos: number; norma: string } | null {
  let achado: { valor_centavos: number; norma: string } | null = null;
  for (const l of SALARIO_MINIMO) if (l.desde <= mes) achado = l;
  return achado;
}

