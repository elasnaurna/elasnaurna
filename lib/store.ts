// Camada de armazenamento. Hoje: IndexedDB no aparelho (funciona offline,
// sem conta, sem servidor). Depois: Supabase, mantendo esta mesma interface.
//
// Regra do cofre: o log de registros é APPEND-ONLY. Nunca se sobrescreve nem
// se apaga um registro. "Editar" = inserir nova versão. "Atual" = derivado.

import { createStore, get, set, keys, del } from "idb-keyval";
import type { CategoriaId, Comprovante, Despesa, DespesaAtual, Leitura, Rateio } from "./types";
import { novoId, sha256Hex } from "./hash";

const registros = createStore("cofre-db", "registros");
const blobs = createStore("cofre-blobs", "blobs");

/** Avisa quem estiver ouvindo (a sincronização) que algo novo foi gravado. */
export function notificarGravacao() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cofre:gravou"));
}

/** Quem sabe buscar um comprovante na nuvem se registra aqui (evita import circular). */
let buscadorRemoto: ((blobKey: string) => Promise<Blob | undefined>) | null = null;
export function definirBuscadorRemoto(fn: (blobKey: string) => Promise<Blob | undefined>) {
  buscadorRemoto = fn;
}

export interface NovaDespesaInput {
  /** de qual filho (linhagem do Filho); ausente = de todos / não especificado */
  filho?: string;
  /** parte do filho (se houver rateio, já calculada) */
  valor_centavos: number;
  rateio?: Rateio;
  data_do_fato: string; // YYYY-MM-DD
  categoria: CategoriaId;
  observacao?: string;
  arquivo?: File | null;
  leitura?: Leitura;
}

/** Guarda o arquivo no aparelho (chave = SHA-256) e devolve a etiqueta. Usado por despesas e pagamentos. */
export async function guardarComprovante(arquivo: File): Promise<Comprovante> {
  const buf = await arquivo.arrayBuffer();
  const sha256 = await sha256Hex(buf);
  // A chave do blob é o próprio hash: mesmo arquivo nunca é guardado duas vezes,
  // e qualquer alteração nos bytes muda a chave.
  const blobKey = `sha256:${sha256}`;
  const existente = await get<Blob>(blobKey, blobs);
  if (!existente) {
    await set(blobKey, new Blob([buf], { type: arquivo.type || "application/octet-stream" }), blobs);
  }
  return {
    blobKey,
    mime: arquivo.type || "application/octet-stream",
    tamanho: arquivo.size,
    sha256,
    nomeOriginal: arquivo.name || undefined,
  };
}

/** Insere uma despesa nova (versão 1 de uma linhagem nova). */
export async function criarDespesa(input: NovaDespesaInput): Promise<Despesa> {
  const id = novoId();
  const despesa: Despesa = {
    id,
    linhagem: id,
    versao: 1,
    versao_de: null,
    criado_em: new Date().toISOString(),
    filho: input.filho || undefined,
    data_do_fato: input.data_do_fato,
    valor_centavos: input.valor_centavos,
    rateio: input.rateio,
    categoria: input.categoria,
    observacao: input.observacao?.trim() || undefined,
    comprovante: input.arquivo ? await guardarComprovante(input.arquivo) : undefined,
    leitura: input.leitura,
    origem: "cliente",
  };
  await set(id, despesa, registros);
  notificarGravacao();
  return despesa;
}

/**
 * Insere VÁRIAS despesas que compartilham o mesmo comprovante (ex.: print de
 * fatura de cartão). O arquivo é guardado uma vez só; cada despesa é um
 * registro independente, ligado às irmãs por `lote`.
 */
export async function criarDespesasEmLote(
  itens: Array<Omit<NovaDespesaInput, "arquivo">>,
  arquivo: File | null,
): Promise<Despesa[]> {
  const lote = novoId();
  const comprovante = arquivo ? await guardarComprovante(arquivo) : undefined;
  const criadas: Despesa[] = [];
  for (const item of itens) {
    const id = novoId();
    const despesa: Despesa = {
      id,
      linhagem: id,
      versao: 1,
      versao_de: null,
      criado_em: new Date().toISOString(),
      filho: item.filho || undefined,
      data_do_fato: item.data_do_fato,
      valor_centavos: item.valor_centavos,
      rateio: item.rateio,
      categoria: item.categoria,
      observacao: item.observacao?.trim() || undefined,
      comprovante,
      leitura: item.leitura,
      lote,
      origem: "cliente",
    };
    await set(id, despesa, registros);
    criadas.push(despesa);
  }
  notificarGravacao();
  return criadas;
}

export interface EdicaoInput extends Partial<Omit<NovaDespesaInput, "leitura" | "rateio" | "filho">> {
  /** novo rateio; `null` remove o rateio; undefined mantém o anterior */
  rateio?: Rateio | null;
  /** novo filho; `null` = passa a ser "de todos"; undefined mantém */
  filho?: string | null;
  /** por que está alterando (opcional na edição, obrigatório na retirada) */
  motivo?: string;
}

/**
 * "Edita" uma despesa criando nova versão. O registro anterior permanece
 * intacto e continua legível no histórico.
 */
export async function novaVersao(anterior: Despesa, input: EdicaoInput): Promise<Despesa> {
  const id = novoId();
  const valor_centavos = input.valor_centavos ?? anterior.valor_centavos;
  const rateio = input.rateio === undefined ? anterior.rateio : input.rateio ?? undefined;
  const data_do_fato = input.data_do_fato ?? anterior.data_do_fato;
  const categoria = input.categoria ?? anterior.categoria;

  // A procedência acompanha a linhagem, mas "confirmado sem alteração" só
  // continua verdadeiro se os campos lidos ainda batem com o que está gravado.
  // Com rateio, o que a leitura viu foi o TOTAL do comprovante.
  const valorLidoComparavel = rateio ? rateio.total_centavos : valor_centavos;
  const leitura: Leitura | undefined = anterior.leitura
    ? {
        ...anterior.leitura,
        confirmado_sem_alteracao:
          (anterior.leitura.valor_centavos === undefined || anterior.leitura.valor_centavos === valorLidoComparavel) &&
          (anterior.leitura.data === undefined || anterior.leitura.data === data_do_fato) &&
          (anterior.leitura.categoria === undefined || anterior.leitura.categoria === categoria),
      }
    : undefined;

  const despesa: Despesa = {
    ...anterior,
    id,
    versao: anterior.versao + 1,
    versao_de: anterior.id,
    criado_em: new Date().toISOString(),
    filho: input.filho === undefined ? anterior.filho : input.filho || undefined,
    data_do_fato,
    valor_centavos,
    rateio,
    categoria,
    observacao: input.observacao !== undefined ? input.observacao.trim() || undefined : anterior.observacao,
    comprovante: input.arquivo ? await guardarComprovante(input.arquivo) : anterior.comprovante,
    leitura,
    retirada: anterior.retirada || undefined,
    motivo: input.motivo?.trim() || undefined,
  };
  await set(id, despesa, registros);
  notificarGravacao();
  return despesa;
}

/**
 * Retira a despesa do acervo atual. NÃO apaga: cria uma versão marcada como
 * retirada, com motivo obrigatório. A despesa deixa de contar nos totais e
 * passa para a seção "Retiradas", de onde pode voltar.
 */
export async function retirarDespesa(anterior: Despesa, motivo: string): Promise<Despesa> {
  const m = motivo.trim();
  if (!m) throw new Error("motivo_obrigatorio");
  const id = novoId();
  const despesa: Despesa = {
    ...anterior,
    id,
    versao: anterior.versao + 1,
    versao_de: anterior.id,
    criado_em: new Date().toISOString(),
    retirada: true,
    motivo: m,
  };
  await set(id, despesa, registros);
  notificarGravacao();
  return despesa;
}

/** Devolve ao acervo uma despesa retirada (nova versão, retirada = false). */
export async function devolverDespesa(anterior: Despesa, motivo?: string): Promise<Despesa> {
  const id = novoId();
  const despesa: Despesa = {
    ...anterior,
    id,
    versao: anterior.versao + 1,
    versao_de: anterior.id,
    criado_em: new Date().toISOString(),
    retirada: undefined,
    motivo: motivo?.trim() || "devolvida ao cofre",
  };
  await set(id, despesa, registros);
  notificarGravacao();
  return despesa;
}

/** Todas as versões de uma linhagem, da mais antiga à mais nova. */
export async function obterLinhagem(linhagem: string): Promise<Despesa[]> {
  const log = await listarLog();
  return log.filter((d) => d.linhagem === linhagem).sort((a, b) => a.versao - b.versao);
}

/** Todas as versões, cruas. É o log. */
export async function listarLog(): Promise<Despesa[]> {
  const ks = await keys<string>(registros);
  const todos = await Promise.all(ks.map((k) => get<Despesa>(k, registros)));
  return todos.filter((d): d is Despesa => !!d);
}

/**
 * Visão atual: a versão mais alta de cada linhagem, ordenada por data do fato
 * desc. Inclui as retiradas (com `retirada: true`) — quem lista decide como
 * mostrá-las; nada é escondido por padrão.
 */
export async function listarAtuais(): Promise<DespesaAtual[]> {
  const log = await listarLog();
  const porLinhagem = new Map<string, Despesa[]>();
  for (const d of log) {
    const arr = porLinhagem.get(d.linhagem) ?? [];
    arr.push(d);
    porLinhagem.set(d.linhagem, arr);
  }
  const atuais: DespesaAtual[] = [];
  for (const versoes of porLinhagem.values()) {
    versoes.sort((a, b) => b.versao - a.versao);
    atuais.push({ ...versoes[0], historico: versoes.length });
  }
  atuais.sort((a, b) =>
    a.data_do_fato === b.data_do_fato
      ? b.criado_em.localeCompare(a.criado_em)
      : b.data_do_fato.localeCompare(a.data_do_fato),
  );
  return atuais;
}

/** Só o que está neste aparelho. */
export async function obterBlobLocal(blobKey: string): Promise<Blob | undefined> {
  return get<Blob>(blobKey, blobs);
}

/** Local primeiro; se não tiver e houver conta, busca na nuvem e guarda aqui. */
export async function obterBlob(blobKey: string): Promise<Blob | undefined> {
  const local = await get<Blob>(blobKey, blobs);
  if (local || !buscadorRemoto) return local;
  try {
    return await buscadorRemoto(blobKey);
  } catch {
    return undefined;
  }
}

export async function guardarBlobLocal(blobKey: string, blob: Blob): Promise<void> {
  await set(blobKey, blob, blobs);
}

/** Registro que veio da nuvem (de outro aparelho): grava sem disparar nova sincronização. */
export async function gravarVindaDaNuvem(d: Despesa): Promise<void> {
  await set(d.id, d, registros);
}

/**
 * Apenas para desenvolvimento: limpa o cofre local. NÃO existe botão para isso
 * na interface do produto — apagar acervo é decisão que exige fundamentação.
 */
export async function _limparTudoDev(): Promise<void> {
  const ks = await keys<string>(registros);
  await Promise.all(ks.map((k) => del(k, registros)));
  const bs = await keys<string>(blobs);
  await Promise.all(bs.map((k) => del(k, blobs)));
}
