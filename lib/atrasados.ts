// Atrasados atualizados — memória de cálculo.
//
// Para cada mês em que entrou menos do que o combinado, a parte em aberto é
// trazida para a data do cálculo: correção monetária pelo índice escolhido
// (do mês do vencimento até o mês anterior ao do cálculo) e juros de mora
// simples, pro rata die, desde o vencimento. É a conta que a contadoria faz.
//
// O app não decide índice nem juros: a sentença ou o juízo decidem. Aqui a
// pessoa (ou o advogado) escolhe entre INPC/IPCA e 1%/0%, e a memória de
// cálculo deixa tudo à mostra para ser conferido e refeito.

import type { MesPensao } from "./pensao";
import { vencimentoEm } from "./pensao";
import { diasEntre, fatorCorrecao, ultimoMes, type Indices, type NomeIndice } from "./indices";

export interface ParametrosAtraso {
  indice: NomeIndice | "nenhum";
  /** juros simples ao mês, em % (1 = 1% a.m.; 0 = sem juros) */
  jurosMes: number;
  /** YYYY-MM-DD — data para a qual os valores são trazidos */
  dataCalculo: string;
}

export const PARAMETROS_PADRAO: Omit<ParametrosAtraso, "dataCalculo"> = { indice: "INPC", jurosMes: 1 };

export interface ParcelaAtrasada {
  mes: string;
  vencimento: string;
  devido: number;
  recebido: number;
  /** o que ficou faltando no mês (devido − recebido) */
  aberto: number;
  fator: number;
  corrigido: number;
  dias: number;
  juros: number;
  total: number;
  /** meses do período sem índice divulgado/disponível (entraram como 1) */
  semIndice: string[];
}

export interface Atrasados {
  parametros: ParametrosAtraso;
  parcelas: ParcelaAtrasada[];
  totalAberto: number;
  totalCorrigido: number;
  totalJuros: number;
  total: number;
  /** em aberto dentro das 3 prestações vencidas mais recentes (recorte do art. 528, § 7º, CPC) */
  tresMaisRecentes: { meses: string[]; total: number };
  /** em aberto fora dessa janela */
  anteriores: { meses: string[]; total: number };
  /** todos os meses sem índice, sem repetição */
  mesesSemIndice: string[];
  /** até que mês o índice escolhido está disponível */
  indiceAte: string | null;
}

/**
 * Calcula os atrasados a partir da visão mês a mês (só meses com combinado e
 * com vencimento até a data do cálculo). Valores em centavos, arredondados
 * por parcela — o total é a soma das parcelas, como numa planilha.
 */
export function calcularAtrasados(meses: MesPensao[], indices: Indices, p: ParametrosAtraso): Atrasados {
  const serie = p.indice === "nenhum" ? null : indices[p.indice];
  const mesCalculo = p.dataCalculo.slice(0, 7);
  const parcelas: ParcelaAtrasada[] = [];

  for (const m of [...meses].sort((a, b) => a.mes.localeCompare(b.mes))) {
    if (m.devido === null || m.diaVencimento === null) continue;
    const aberto = m.devido - m.recebido;
    if (aberto <= 0) continue;
    const vencimento = vencimentoEm(m.mes, m.diaVencimento);
    if (vencimento > p.dataCalculo) continue; // ainda não venceu

    const { fator, semIndice } = serie ? fatorCorrecao(serie, m.mes, mesCalculo) : { fator: 1, semIndice: [] };
    const corrigido = Math.round(aberto * fator);
    const dias = Math.max(0, diasEntre(vencimento, p.dataCalculo));
    const juros = Math.round(((corrigido * p.jurosMes) / 100) * (dias / 30));
    parcelas.push({ mes: m.mes, vencimento, devido: m.devido, recebido: m.recebido, aberto, fator, corrigido, dias, juros, total: corrigido + juros, semIndice });
  }

  const soma = (f: (x: ParcelaAtrasada) => number) => parcelas.reduce((s, x) => s + f(x), 0);

  // Janela do art. 528, § 7º: as 3 prestações mais recentes JÁ VENCIDAS (pagas
  // ou não). Dentro dela, o que estiver em aberto é o que o rito da prisão
  // alcança; o que ficou para trás segue pelo rito da penhora.
  const vencidos = meses
    .filter((m) => m.devido !== null && m.diaVencimento !== null && vencimentoEm(m.mes, m.diaVencimento) <= p.dataCalculo)
    .map((m) => m.mes)
    .sort();
  const janela = new Set(vencidos.slice(-3));
  const recentes = parcelas.filter((x) => janela.has(x.mes));
  const anteriores = parcelas.filter((x) => !janela.has(x.mes));
  const mesesSemIndice = Array.from(new Set(parcelas.flatMap((x) => x.semIndice))).sort();

  return {
    parametros: p,
    parcelas,
    totalAberto: soma((x) => x.aberto),
    totalCorrigido: soma((x) => x.corrigido),
    totalJuros: soma((x) => x.juros),
    total: soma((x) => x.total),
    tresMaisRecentes: { meses: recentes.map((x) => x.mes), total: recentes.reduce((s, x) => s + x.total, 0) },
    anteriores: { meses: anteriores.map((x) => x.mes), total: anteriores.reduce((s, x) => s + x.total, 0) },
    mesesSemIndice,
    indiceAte: serie ? ultimoMes(serie) : null,
  };
}

/** Texto curto do critério, para telas e planilhas. */
export function descreverParametros(p: ParametrosAtraso): string {
  const idx = p.indice === "nenhum" ? "sem correção monetária" : `correção pelo ${p.indice}`;
  const j = p.jurosMes > 0 ? `juros simples de ${p.jurosMes}% ao mês, pro rata die, desde cada vencimento` : "sem juros";
  return `${idx}; ${j}`;
}
