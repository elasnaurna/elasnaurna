// Armazenamento dos pagamentos de pensão recebidos e do valor combinado.
// Mesmas regras do cofre de despesas: APPEND-ONLY. Editar = nova versão;
// retirar = versão marcada, com motivo. Nada é sobrescrito nem apagado.
//
// (idb-keyval só suporta um "store" por banco, por isso cada tipo tem o seu
// banco: cofre-db, cofre-pagamentos, cofre-combinado.)

import { createStore, get, set, keys } from "idb-keyval";
import type { Combinado, FormaPagamento, Leitura, Pagamento, PagamentoAtual } from "./types";
import { novoId } from "./hash";
import { guardarComprovante, notificarGravacao } from "./store";
export { combinadoAtual } from "./pensao";

const pagamentos = createStore("cofre-pagamentos", "pagamentos");
const combinados = createStore("cofre-combinado", "combinado");

export const FORMAS: Array<{ id: FormaPagamento; nome: string }> = [
  { id: "pix", nome: "Pix" },
  { id: "transferencia", nome: "Transferência" },
  { id: "dinheiro", nome: "Dinheiro" },
  { id: "desconto_folha", nome: "Desconto em folha" },
  { id: "outro", nome: "Outro" },
];

export function nomeForma(f?: FormaPagamento): string {
  return FORMAS.find((x) => x.id === f)?.nome ?? "";
}

// ---------------------------------------------------------------------------
// Pagamentos
// ---------------------------------------------------------------------------

export interface NovoPagamentoInput {
  valor_centavos: number;
  data_do_fato: string; // YYYY-MM-DD
  referencia: string; // YYYY-MM
  forma?: FormaPagamento;
  observacao?: string;
  arquivo?: File | null;
  leitura?: Leitura;
}

export async function criarPagamento(input: NovoPagamentoInput): Promise<Pagamento> {
  const id = novoId();
  const p: Pagamento = {
    id,
    linhagem: id,
    versao: 1,
    versao_de: null,
    criado_em: new Date().toISOString(),
    data_do_fato: input.data_do_fato,
    valor_centavos: input.valor_centavos,
    referencia: input.referencia,
    forma: input.forma,
    observacao: input.observacao?.trim() || undefined,
    comprovante: input.arquivo ? await guardarComprovante(input.arquivo) : undefined,
    leitura: input.leitura,
    origem: "cliente",
  };
  await set(id, p, pagamentos);
  notificarGravacao();
  return p;
}

export interface EdicaoPagamentoInput extends Partial<Omit<NovoPagamentoInput, "leitura">> {
  motivo?: string;
}

/** "Edita" criando nova versão. A anterior fica intacta no histórico. */
export async function novaVersaoPagamento(anterior: Pagamento, input: EdicaoPagamentoInput): Promise<Pagamento> {
  const id = novoId();
  const valor_centavos = input.valor_centavos ?? anterior.valor_centavos;
  const data_do_fato = input.data_do_fato ?? anterior.data_do_fato;
  const leitura: Leitura | undefined = anterior.leitura
    ? {
        ...anterior.leitura,
        confirmado_sem_alteracao:
          (anterior.leitura.valor_centavos === undefined || anterior.leitura.valor_centavos === valor_centavos) &&
          (anterior.leitura.data === undefined || anterior.leitura.data === data_do_fato),
      }
    : undefined;
  const p: Pagamento = {
    ...anterior,
    id,
    versao: anterior.versao + 1,
    versao_de: anterior.id,
    criado_em: new Date().toISOString(),
    data_do_fato,
    valor_centavos,
    referencia: input.referencia ?? anterior.referencia,
    forma: input.forma !== undefined ? input.forma : anterior.forma,
    observacao: input.observacao !== undefined ? input.observacao.trim() || undefined : anterior.observacao,
    comprovante: input.arquivo ? await guardarComprovante(input.arquivo) : anterior.comprovante,
    leitura,
    retirada: anterior.retirada || undefined,
    motivo: input.motivo?.trim() || undefined,
  };
  await set(id, p, pagamentos);
  notificarGravacao();
  return p;
}

export async function retirarPagamento(anterior: Pagamento, motivo: string): Promise<Pagamento> {
  const m = motivo.trim();
  if (!m) throw new Error("motivo_obrigatorio");
  const id = novoId();
  const p: Pagamento = { ...anterior, id, versao: anterior.versao + 1, versao_de: anterior.id, criado_em: new Date().toISOString(), retirada: true, motivo: m };
  await set(id, p, pagamentos);
  notificarGravacao();
  return p;
}

export async function devolverPagamento(anterior: Pagamento, motivo?: string): Promise<Pagamento> {
  const id = novoId();
  const p: Pagamento = {
    ...anterior,
    id,
    versao: anterior.versao + 1,
    versao_de: anterior.id,
    criado_em: new Date().toISOString(),
    retirada: undefined,
    motivo: motivo?.trim() || "devolvido ao cofre",
  };
  await set(id, p, pagamentos);
  notificarGravacao();
  return p;
}

/** Todas as versões, cruas. */
export async function listarLogPagamentos(): Promise<Pagamento[]> {
  const ks = await keys<string>(pagamentos);
  const todos = await Promise.all(ks.map((k) => get<Pagamento>(k, pagamentos)));
  return todos.filter((p): p is Pagamento => !!p);
}

/** Versão mais alta de cada linhagem, inclusive retirados. Ordem: referência desc, data desc. */
export function pagamentosAtuais(log: Pagamento[]): PagamentoAtual[] {
  const porLinhagem = new Map<string, Pagamento[]>();
  for (const p of log) porLinhagem.set(p.linhagem, [...(porLinhagem.get(p.linhagem) ?? []), p]);
  const atuais: PagamentoAtual[] = [];
  for (const versoes of porLinhagem.values()) {
    versoes.sort((a, b) => b.versao - a.versao);
    atuais.push({ ...versoes[0], historico: versoes.length });
  }
  atuais.sort((a, b) =>
    a.referencia === b.referencia ? b.data_do_fato.localeCompare(a.data_do_fato) : b.referencia.localeCompare(a.referencia),
  );
  return atuais;
}

export async function listarPagamentosAtuais(): Promise<PagamentoAtual[]> {
  return pagamentosAtuais(await listarLogPagamentos());
}

export async function obterLinhagemPagamento(linhagem: string): Promise<Pagamento[]> {
  const log = await listarLogPagamentos();
  return log.filter((p) => p.linhagem === linhagem).sort((a, b) => a.versao - b.versao);
}

/** Veio da nuvem (outro aparelho): grava sem redisparar sincronização. */
export async function gravarPagamentoVindoDaNuvem(p: Pagamento): Promise<void> {
  await set(p.id, p, pagamentos);
}

// ---------------------------------------------------------------------------
// Valor combinado
// ---------------------------------------------------------------------------

export interface CombinadoInput {
  /** "reais" (padrão) ou "sm" (% do salário mínimo) */
  modo?: "reais" | "sm";
  percentual_sm?: number;
  /** em "sm", o valor no mês do registro (referência); em "reais", o valor fixo */
  valor_centavos: number;
  dia_vencimento: number;
  vigente_desde: string; // YYYY-MM
  observacao?: string;
}

/**
 * Define (primeira vez) ou altera (nova versão) o valor combinado. A linhagem
 * é uma só; `anterior` é a versão atual quando houver.
 */
export async function definirCombinado(input: CombinadoInput, anterior: Combinado | null, motivo?: string): Promise<Combinado> {
  const id = novoId();
  const c: Combinado = {
    id,
    linhagem: anterior?.linhagem ?? id,
    versao: anterior ? anterior.versao + 1 : 1,
    versao_de: anterior?.id ?? null,
    criado_em: new Date().toISOString(),
    modo: input.modo === "sm" ? "sm" : "reais",
    percentual_sm: input.modo === "sm" ? input.percentual_sm : undefined,
    valor_centavos: input.valor_centavos,
    dia_vencimento: Math.min(31, Math.max(1, Math.round(input.dia_vencimento))),
    vigente_desde: input.vigente_desde,
    observacao: input.observacao?.trim() || undefined,
    motivo: anterior ? motivo?.trim() || undefined : undefined,
    origem: "cliente",
  };
  await set(id, c, combinados);
  notificarGravacao();
  return c;
}

/** "Não há mais valor combinado" — versão retirada, com motivo. O histórico fica. */
export async function retirarCombinado(anterior: Combinado, motivo: string): Promise<Combinado> {
  const m = motivo.trim();
  if (!m) throw new Error("motivo_obrigatorio");
  const id = novoId();
  const c: Combinado = { ...anterior, id, versao: anterior.versao + 1, versao_de: anterior.id, criado_em: new Date().toISOString(), retirada: true, motivo: m };
  await set(id, c, combinados);
  notificarGravacao();
  return c;
}

export async function listarLogCombinado(): Promise<Combinado[]> {
  const ks = await keys<string>(combinados);
  const todos = await Promise.all(ks.map((k) => get<Combinado>(k, combinados)));
  return todos.filter((c): c is Combinado => !!c).sort((a, b) => a.versao - b.versao);
}

export async function gravarCombinadoVindoDaNuvem(c: Combinado): Promise<void> {
  await set(c.id, c, combinados);
}
