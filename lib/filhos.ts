// Perfis dos filhos. Mesmas regras do cofre: append-only, versão nova a cada
// mudança, retirada com motivo (um perfil duplicado, por exemplo). As
// despesas apontam para a LINHAGEM do filho, então editar o nome não quebra
// nada — e a despesa sempre mostra o nome atual.

import { createStore, get, set, keys } from "idb-keyval";
import type { Filho, FilhoAtual } from "./types";
import { novoId } from "./hash";
import { notificarGravacao } from "./store";

const filhos = createStore("cofre-filhos", "filhos");

export interface FilhoInput {
  nome: string;
  nascimento?: string; // YYYY-MM-DD
  roupa?: string;
  calcado?: string;
  escola?: string;
  observacao?: string;
}

function limpar(input: FilhoInput) {
  const t = (v?: string) => v?.trim() || undefined;
  return { nome: input.nome.trim(), nascimento: t(input.nascimento), roupa: t(input.roupa), calcado: t(input.calcado), escola: t(input.escola), observacao: t(input.observacao) };
}

export async function criarFilho(input: FilhoInput): Promise<Filho> {
  const id = novoId();
  const f: Filho = { id, linhagem: id, versao: 1, versao_de: null, criado_em: new Date().toISOString(), ...limpar(input), origem: "cliente" };
  if (!f.nome) throw new Error("nome_obrigatorio");
  await set(id, f, filhos);
  notificarGravacao();
  return f;
}

export async function novaVersaoFilho(anterior: Filho, input: FilhoInput, motivo?: string): Promise<Filho> {
  const id = novoId();
  const f: Filho = {
    ...anterior,
    id,
    versao: anterior.versao + 1,
    versao_de: anterior.id,
    criado_em: new Date().toISOString(),
    ...limpar(input),
    retirada: anterior.retirada || undefined,
    motivo: motivo?.trim() || undefined,
  };
  if (!f.nome) throw new Error("nome_obrigatorio");
  await set(id, f, filhos);
  notificarGravacao();
  return f;
}

export async function retirarFilho(anterior: Filho, motivo: string): Promise<Filho> {
  const m = motivo.trim();
  if (!m) throw new Error("motivo_obrigatorio");
  const id = novoId();
  const f: Filho = { ...anterior, id, versao: anterior.versao + 1, versao_de: anterior.id, criado_em: new Date().toISOString(), retirada: true, motivo: m };
  await set(id, f, filhos);
  notificarGravacao();
  return f;
}

export async function devolverFilho(anterior: Filho): Promise<Filho> {
  const id = novoId();
  const f: Filho = { ...anterior, id, versao: anterior.versao + 1, versao_de: anterior.id, criado_em: new Date().toISOString(), retirada: undefined, motivo: "devolvido" };
  await set(id, f, filhos);
  notificarGravacao();
  return f;
}

export async function listarLogFilhos(): Promise<Filho[]> {
  const ks = await keys<string>(filhos);
  const todos = await Promise.all(ks.map((k) => get<Filho>(k, filhos)));
  return todos.filter((f): f is Filho => !!f);
}

/** Versão mais alta de cada linhagem, ordenada por ordem de cadastro (mais velho primeiro). */
export function filhosAtuais(log: Filho[]): FilhoAtual[] {
  const porLinhagem = new Map<string, Filho[]>();
  for (const f of log) porLinhagem.set(f.linhagem, [...(porLinhagem.get(f.linhagem) ?? []), f]);
  const atuais: FilhoAtual[] = [];
  for (const versoes of porLinhagem.values()) {
    versoes.sort((a, b) => b.versao - a.versao);
    atuais.push({ ...versoes[0], historico: versoes.length });
  }
  const primeira = (f: FilhoAtual) => porLinhagem.get(f.linhagem)!.reduce((a, b) => (a.versao < b.versao ? a : b)).criado_em;
  atuais.sort((a, b) => primeira(a).localeCompare(primeira(b)));
  return atuais;
}

/** Só os ativos (não retirados). */
export async function listarFilhos(): Promise<FilhoAtual[]> {
  return filhosAtuais(await listarLogFilhos()).filter((f) => !f.retirada);
}

export async function listarFilhosComRetirados(): Promise<FilhoAtual[]> {
  return filhosAtuais(await listarLogFilhos());
}

export async function obterLinhagemFilho(linhagem: string): Promise<Filho[]> {
  const log = await listarLogFilhos();
  return log.filter((f) => f.linhagem === linhagem).sort((a, b) => a.versao - b.versao);
}

export async function gravarFilhoVindoDaNuvem(f: Filho): Promise<void> {
  await set(f.id, f, filhos);
}

// ---------------------------------------------------------------------------
// Ajudas de apresentação (puras)
// ---------------------------------------------------------------------------

/** "8 anos", "1 ano e 4 meses", "7 meses" — ou "" sem nascimento. */
export function idade(nascimento: string | undefined, hoje = new Date()): string {
  if (!nascimento) return "";
  const n = new Date(nascimento + "T00:00:00");
  if (Number.isNaN(n.getTime())) return "";
  let anos = hoje.getFullYear() - n.getFullYear();
  let meses = hoje.getMonth() - n.getMonth();
  if (hoje.getDate() < n.getDate()) meses--;
  if (meses < 0) {
    anos--;
    meses += 12;
  }
  if (anos < 0) return "";
  if (anos === 0) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  if (anos < 2 && meses > 0) return `${anos} ano e ${meses} ${meses === 1 ? "mês" : "meses"}`;
  return `${anos} ${anos === 1 ? "ano" : "anos"}`;
}

/** Mapa linhagem → nome, para listas e planilhas. */
export function nomesDosFilhos(filhos: Filho[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of filhosAtuais(filhos)) m.set(f.linhagem, f.nome);
  return m;
}

/** Nome do filho de uma despesa, ou o rótulo de "não especificado". */
export function nomeDoFilho(filho: string | undefined, nomes: Map<string, string>, seVazio = "todos"): string {
  if (!filho) return seVazio;
  return nomes.get(filho) ?? "filho retirado";
}

/** "Sofia e Theo", "Sofia, Theo e Lia" */
export function listarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
