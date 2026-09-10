// Contas da pensão, mês a mês: o que era devido (valor combinado vigente),
// o que entrou (pagamentos por mês de referência) e o custo do filho no mês
// (despesas ativas). Só aritmética — a leitura do que isso significa é do
// advogado.

import type { Combinado, DespesaAtual, PagamentoAtual } from "./types";
import { salarioMinimoEm } from "./salario-minimo";

export interface MesPensao {
  /** YYYY-MM */
  mes: string;
  /** devido no mês, se havia valor combinado vigente */
  devido: number | null;
  diaVencimento: number | null;
  /** soma dos pagamentos ativos com referência neste mês */
  recebido: number;
  pagamentos: PagamentoAtual[];
}

export interface PontoCustoPensao {
  mes: string;
  /** parte do filho nas despesas ativas do mês */
  custo: number;
  recebido: number;
  devido: number | null;
}

/** A versão mais alta do combinado, ou null se nunca houve ou se foi retirado. */
export function combinadoAtual(log: Combinado[]): Combinado | null {
  if (log.length === 0) return null;
  const ultimo = log.reduce((a, b) => (b.versao > a.versao ? b : a));
  return ultimo.retirada ? null : ultimo;
}

export function mesAtual(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function proximoMes(m: string): string {
  const [a, mm] = m.split("-").map(Number);
  return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
}

export function mesAnterior(m: string): string {
  const [a, mm] = m.split("-").map(Number);
  return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, "0")}`;
}

/** Meses de `de` a `ate`, inclusive, em ordem crescente. */
export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let m = de; m <= ate && out.length < 600; m = proximoMes(m)) out.push(m);
  return out;
}

/** Data de vencimento no mês (dia limitado ao tamanho do mês), YYYY-MM-DD. */
export function vencimentoEm(mes: string, dia: number): string {
  const [a, mm] = mes.split("-").map(Number);
  const ultimo = new Date(a, mm, 0).getDate();
  return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Dias entre o vencimento do mês de referência e a data em que o pagamento entrou (negativo = antes). */
export function diasAposVencimento(p: { data_do_fato: string; referencia: string }, dia: number): number {
  const v = new Date(vencimentoEm(p.referencia, dia) + "T00:00:00");
  const d = new Date(p.data_do_fato + "T00:00:00");
  return Math.round((d.getTime() - v.getTime()) / 86400000);
}

/**
 * O que era devido num mês: a versão mais alta do combinado, entre as não
 * retiradas, cujo `vigente_desde` já valia naquele mês. Assim uma correção
 * (mesmo `vigente_desde`) substitui a anterior, e uma revisional (novo
 * `vigente_desde`) só vale dali em diante. Se o combinado foi retirado, nada
 * é devido em mês nenhum.
 */
export interface Devido {
  valor: number;
  dia: number;
  /** presente quando a pensão é em % do salário mínimo: qual mínimo e qual % geraram o valor */
  sm?: { salario_centavos: number; percentual: number; norma: string };
}

export function devidoNoMes(logCombinado: Combinado[], mes: string): Devido | null {
  if (!combinadoAtual(logCombinado)) return null;
  let melhor: Combinado | null = null;
  for (const c of logCombinado) {
    if (c.retirada || c.vigente_desde > mes) continue;
    if (!melhor || c.versao > melhor.versao) melhor = c;
  }
  if (!melhor) return null;
  return valorDoCombinado(melhor, mes);
}

/** O valor que um combinado gera num mês: fixo em reais, ou % do salário mínimo daquele mês. */
export function valorDoCombinado(c: Combinado, mes: string): Devido {
  if (c.modo === "sm" && c.percentual_sm) {
    const sm = salarioMinimoEm(mes);
    if (sm) {
      return {
        valor: Math.round((sm.valor_centavos * c.percentual_sm) / 100),
        dia: c.dia_vencimento,
        sm: { salario_centavos: sm.valor_centavos, percentual: c.percentual_sm, norma: sm.norma },
      };
    }
  }
  return { valor: c.valor_centavos, dia: c.dia_vencimento };
}

/** "30% do salário mínimo" ou "R$ 1.500,00" — como descrever o combinado. */
export function descreverCombinado(c: Combinado, brl: (v: number) => string): string {
  if (c.modo === "sm" && c.percentual_sm) {
    const p = Number.isInteger(c.percentual_sm) ? String(c.percentual_sm) : c.percentual_sm.toFixed(2).replace(".", ",");
    return `${p}% do salário mínimo`;
  }
  return brl(c.valor_centavos);
}

/** Primeiro mês com algo registrado (pagamento ou combinado), ou null. */
function primeiroMes(pagamentos: PagamentoAtual[], logCombinado: Combinado[]): string | null {
  const meses = pagamentos.map((p) => p.referencia);
  for (const c of logCombinado) if (!c.retirada) meses.push(c.vigente_desde);
  return meses.length ? meses.reduce((a, b) => (b < a ? b : a)) : null;
}

/**
 * Um item por mês, do mais recente ao mais antigo, desde o primeiro mês com
 * registro até hoje (ou até o último mês de referência, se for futuro).
 * Só pagamentos ATIVOS entram; retirados ficam fora das contas.
 */
export function mesesPensao(pagamentos: PagamentoAtual[], logCombinado: Combinado[], hoje = mesAtual()): MesPensao[] {
  const ativos = pagamentos.filter((p) => !p.retirada);
  const de = primeiroMes(ativos, logCombinado);
  if (!de) return [];
  const ate = ativos.reduce((a, p) => (p.referencia > a ? p.referencia : a), hoje);
  return mesesEntre(de, ate)
    .map((mes) => {
      const dev = devidoNoMes(logCombinado, mes);
      const doMes = ativos.filter((p) => p.referencia === mes);
      return {
        mes,
        devido: dev?.valor ?? null,
        diaVencimento: dev?.dia ?? null,
        recebido: doMes.reduce((s, p) => s + p.valor_centavos, 0),
        pagamentos: doMes,
      };
    })
    .reverse();
}

/**
 * Série para o gráfico custo × pensão: os últimos `ultimos` meses até hoje,
 * começando no primeiro mês em que há qualquer registro. Ordem crescente.
 */
export function serieCustoPensao(
  despesas: DespesaAtual[],
  pagamentos: PagamentoAtual[],
  logCombinado: Combinado[],
  ultimos = 12,
  hoje = mesAtual(),
): PontoCustoPensao[] {
  const ativasD = despesas.filter((d) => !d.retirada);
  const ativosP = pagamentos.filter((p) => !p.retirada);
  const candidatos = [...ativasD.map((d) => d.data_do_fato.slice(0, 7)), ...ativosP.map((p) => p.referencia)];
  for (const c of logCombinado) if (!c.retirada) candidatos.push(c.vigente_desde);
  if (candidatos.length === 0) return [];
  let de = hoje;
  for (let i = 1; i < ultimos; i++) de = mesAnterior(de);
  const primeiro = candidatos.reduce((a, b) => (b < a ? b : a));
  if (primeiro > de) de = primeiro;
  return mesesEntre(de, hoje).map((mes) => ({
    mes,
    custo: ativasD.filter((d) => d.data_do_fato.slice(0, 7) === mes).reduce((s, d) => s + d.valor_centavos, 0),
    recebido: ativosP.filter((p) => p.referencia === mes).reduce((s, p) => s + p.valor_centavos, 0),
    devido: devidoNoMes(logCombinado, mes)?.valor ?? null,
  }));
}

/** Frase curta do mês, só com fatos: o que era combinado, o que entrou, a diferença. */
export function descreverMes(m: MesPensao, brl: (c: number) => string): { texto: string; tom: "ok" | "risco" | "neutro" } {
  if (m.devido === null) {
    return m.pagamentos.length ? { texto: "", tom: "neutro" } : { texto: "sem registro de pagamento", tom: "neutro" };
  }
  if (m.recebido === 0) return { texto: `combinado ${brl(m.devido)} · sem registro de pagamento`, tom: "risco" };
  if (m.recebido < m.devido) return { texto: `combinado ${brl(m.devido)} · faltam ${brl(m.devido - m.recebido)}`, tom: "risco" };
  if (m.recebido === m.devido) return { texto: `combinado ${brl(m.devido)} · recebido integralmente`, tom: "ok" };
  return { texto: `combinado ${brl(m.devido)} · ${brl(m.recebido - m.devido)} acima`, tom: "ok" };
}
