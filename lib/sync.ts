// Sincronização aparelho <-> conta. O aparelho continua sendo a fonte de
// trabalho (funciona offline); a conta é a cópia que junta todos os aparelhos
// e, depois, o que o advogado vai ver.
//
// Como os registros são imutáveis e têm id único, sincronizar é só "união":
// sobe o que este aparelho tem e a nuvem não; desce o que a nuvem tem e este
// aparelho não. Não existe conflito possível.
//
// Na nuvem tudo vai para UMA tabela (`registros`): tipo + os dados do
// registro em JSON. Assim despesas, pagamentos e o valor combinado usam o
// mesmo código aqui e as mesmas regras lá (só ler e inserir).

import { createStore, get, set } from "idb-keyval";
import { contaConfigurada, supabase } from "./supabase";
import { sessaoAtual } from "./conta";
import { definirBuscadorRemoto, gravarVindaDaNuvem, guardarBlobLocal, listarLog, obterBlobLocal } from "./store";
import { gravarCombinadoVindoDaNuvem, gravarPagamentoVindoDaNuvem, listarLogCombinado, listarLogPagamentos } from "./pagamentos";
import { gravarFilhoVindoDaNuvem, listarLogFilhos } from "./filhos";
import type { Combinado, Comprovante, Despesa, Filho, Pagamento, Registro, TipoRegistro } from "./types";

// o que já subiu para QUAL conta: "reg:<uid>:<id>" / "blob:<uid>:<blobKey>"
const marcas = createStore("cofre-sync", "marcas");

/** Cada tipo de registro: como listar o log local e como gravar o que veio da nuvem. */
interface Fonte {
  tipo: TipoRegistro;
  log: () => Promise<Registro[]>;
  gravar: (r: Registro) => Promise<void>;
}
const FONTES: Fonte[] = [
  { tipo: "despesa", log: listarLog, gravar: (r) => gravarVindaDaNuvem(r as Despesa) },
  { tipo: "pagamento", log: listarLogPagamentos, gravar: (r) => gravarPagamentoVindoDaNuvem(r as Pagamento) },
  { tipo: "combinado", log: listarLogCombinado, gravar: (r) => gravarCombinadoVindoDaNuvem(r as Combinado) },
  { tipo: "filho", log: listarLogFilhos, gravar: (r) => gravarFilhoVindoDaNuvem(r as Filho) },
];

export interface EstadoSync {
  estado: "sem_conta" | "deslogado" | "sincronizando" | "ok" | "erro";
  pendentes: number;
  ultima?: string;
  detalhe?: string;
}

let ultimo: EstadoSync = { estado: contaConfigurada() ? "deslogado" : "sem_conta", pendentes: 0 };
let emAndamento: Promise<EstadoSync> | null = null;
const ouvintes = new Set<(e: EstadoSync) => void>();

export function estadoSync(): EstadoSync {
  return ultimo;
}

export function observarSync(cb: (e: EstadoSync) => void): () => void {
  ouvintes.add(cb);
  cb(ultimo);
  return () => {
    ouvintes.delete(cb);
  };
}

function emitir(e: EstadoSync): EstadoSync {
  ultimo = e;
  ouvintes.forEach((cb) => cb(e));
  return e;
}

function caminhoBlob(uid: string, blobKey: string): string {
  return `${uid}/${blobKey.replace(":", "-")}`;
}

function linhaDe(tipo: TipoRegistro, r: Registro) {
  return {
    id: r.id,
    tipo,
    linhagem: r.linhagem,
    versao: r.versao,
    versao_de: r.versao_de,
    criado_em: r.criado_em,
    dados: r,
  };
}

async function logsLocais(): Promise<Array<{ fonte: Fonte; log: Registro[] }>> {
  return Promise.all(FONTES.map(async (fonte) => ({ fonte, log: await fonte.log() })));
}

async function contarPendentes(uid: string): Promise<number> {
  let n = 0;
  for (const { log } of await logsLocais()) for (const r of log) if (!(await get(`reg:${uid}:${r.id}`, marcas))) n++;
  return n;
}

/** Sobe o que falta, desce o que falta. Idempotente; seguro chamar à vontade. */
export function sincronizar(): Promise<EstadoSync> {
  if (emAndamento) return emAndamento;
  emAndamento = executar().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function executar(): Promise<EstadoSync> {
  if (!contaConfigurada()) return emitir({ estado: "sem_conta", pendentes: 0 });
  const sessao = await sessaoAtual();
  if (!sessao) return emitir({ estado: "deslogado", pendentes: 0 });
  const uid = sessao.id;

  try {
    emitir({ estado: "sincronizando", pendentes: await contarPendentes(uid), ultima: ultimo.ultima });
    const sb = supabase();
    const logs = await logsLocais();

    // 1) registros que este aparelho tem e a conta não
    for (const { fonte, log } of logs) {
      for (const r of log) {
        if (await get(`reg:${uid}:${r.id}`, marcas)) continue;
        const { error } = await sb.from("registros").insert(linhaDe(fonte.tipo, r));
        // 23505 = já existe (outro aparelho subiu o mesmo id) — também é sucesso
        if (error && error.code !== "23505") throw new Error(`registro: ${error.message}`);
        await set(`reg:${uid}:${r.id}`, true, marcas);
      }
    }

    // 2) comprovantes que este aparelho tem e a conta não
    const chaves = new Set<string>();
    for (const { log } of logs)
      for (const r of log) {
        const c = (r as { comprovante?: Comprovante }).comprovante;
        if (c) chaves.add(c.blobKey);
      }
    for (const k of chaves) {
      if (await get(`blob:${uid}:${k}`, marcas)) continue;
      const b = await obterBlobLocal(k);
      if (!b) continue; // veio da nuvem e ainda não foi baixado — nada a subir
      const { error } = await sb.storage
        .from("comprovantes")
        .upload(caminhoBlob(uid, k), b, { contentType: b.type || "application/octet-stream", upsert: false });
      if (error && !/exists|duplicate|409/i.test(error.message)) throw new Error(`comprovante: ${error.message}`);
      await set(`blob:${uid}:${k}`, true, marcas);
    }

    // 3) registros que a conta tem e este aparelho não
    const { data, error } = await sb.from("registros").select("id,tipo,dados").eq("dono", uid);
    if (error) throw new Error(`leitura: ${error.message}`);
    const locais = new Set<string>();
    for (const { log } of logs) for (const r of log) locais.add(r.id);
    let novos = 0;
    for (const row of (data ?? []) as Array<{ id: string; tipo: TipoRegistro; dados: Registro }>) {
      if (!locais.has(row.id)) {
        const fonte = FONTES.find((f) => f.tipo === row.tipo);
        if (fonte) {
          await fonte.gravar({ ...row.dados, id: row.id });
          novos++;
        }
      }
      await set(`reg:${uid}:${row.id}`, true, marcas);
    }
    if (novos > 0 && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cofre:sincronizou"));

    return emitir({ estado: "ok", pendentes: 0, ultima: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emitir({ estado: "erro", pendentes: await contarPendentes(uid).catch(() => 0), ultima: ultimo.ultima, detalhe: msg });
  }
}

/** Liga a sincronização automática. Chamar uma vez, no cliente. Devolve o desligar. */
export function iniciarSync(): () => void {
  if (typeof window === "undefined" || !contaConfigurada()) return () => {};

  // comprovante que não está neste aparelho: busca na conta e guarda aqui
  definirBuscadorRemoto(async (blobKey) => {
    const s = await sessaoAtual();
    if (!s) return undefined;
    const { data, error } = await supabase().storage.from("comprovantes").download(caminhoBlob(s.id, blobKey));
    if (error || !data) return undefined;
    await guardarBlobLocal(blobKey, data);
    await set(`blob:${s.id}:${blobKey}`, true, marcas);
    return data;
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const agendar = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void sincronizar(), 800);
  };
  const agora = () => void sincronizar();

  window.addEventListener("cofre:gravou", agendar);
  window.addEventListener("online", agora);
  const { data: auth } = supabase().auth.onAuthStateChange(() => agendar());
  agendar();

  return () => {
    window.removeEventListener("cofre:gravou", agendar);
    window.removeEventListener("online", agora);
    auth.subscription.unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
