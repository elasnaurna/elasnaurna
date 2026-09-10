// Google Drive: manda a pasta de exportação para o Drive DA CLIENTE (não do
// advogado) e, se ela quiser, dá acesso de leitura ao advogado por e-mail.
//
// Tudo acontece no navegador, direto entre o aparelho e o Google — o AlimentaProva não
// tem servidor no meio. Escopo `drive.file`: o app só enxerga o que ele mesmo
// criou; nunca lê o resto do Drive da pessoa.
//
// Precisa de NEXT_PUBLIC_GOOGLE_CLIENT_ID (OAuth client "Web application" no
// Google Cloud, com a origem do site autorizada). Sem isso, o cartão do Drive
// mostra "não configurado" e nada mais muda.

import type { Preparado, Periodo } from "./exportar";
import { conteudoDaPasta, nomePasta } from "./exportar";
import { INDICES_EMBUTIDOS, type Indices } from "./indices";
import { obterBlob } from "./store";

const ESCOPO = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";

export function driveConfigurado(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

// ---------- token (Google Identity Services) ----------

type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type Gis = { accounts: { oauth2: { initTokenClient: (c: Record<string, unknown>) => TokenClient } } };

function carregarGis(): Promise<Gis> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { google?: Gis };
    if (w.google?.accounts?.oauth2) return resolve(w.google);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google?.accounts?.oauth2 ? resolve(w.google) : reject(new Error("gis_indisponivel")));
    s.onerror = () => reject(new Error("gis_nao_carregou"));
    document.head.appendChild(s);
  });
}

let tokenCache: { valor: string; expira: number } | null = null;

export async function obterToken(): Promise<string> {
  if (tokenCache && tokenCache.expira > Date.now() + 30_000) return tokenCache.valor;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("drive_nao_configurado");
  const google = await carregarGis();
  return new Promise((resolve, reject) => {
    const cliente = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: ESCOPO,
      callback: (r: { access_token?: string; expires_in?: number; error?: string }) => {
        if (r.error || !r.access_token) return reject(new Error(r.error || "sem_token"));
        tokenCache = { valor: r.access_token, expira: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e: { type?: string }) => reject(new Error(e.type || "popup_fechado")),
    });
    cliente.requestAccessToken();
  });
}

// ---------- chamadas ----------

async function driveFetch(token: string, url: string, init: RequestInit): Promise<Response> {
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`drive_${r.status}: ${txt.slice(0, 200)}`);
  }
  return r;
}

export async function criarPasta(token: string, nome: string, paiId?: string): Promise<string> {
  const r = await driveFetch(token, `${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: paiId ? [paiId] : undefined }),
  });
  return ((await r.json()) as { id: string }).id;
}

export async function enviarArquivo(token: string, nome: string, dados: Blob | Uint8Array | string, mime: string, paiId: string): Promise<string> {
  const meta = JSON.stringify({ name: nome, parents: [paiId] });
  const limite = `cofre-${Math.random().toString(36).slice(2)}`;
  const corpo = new Blob(
    [
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${limite}\r\nContent-Type: ${mime}\r\n\r\n`,
      dados as BlobPart,
      `\r\n--${limite}--`,
    ],
    { type: `multipart/related; boundary=${limite}` },
  );
  const r = await driveFetch(token, UPLOAD, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${limite}` }, body: corpo });
  return ((await r.json()) as { id: string }).id;
}

/** Dá acesso de leitura a um e-mail (o advogado). O Google avisa por e-mail. */
export async function compartilharCom(token: string, arquivoId: string, email: string, mensagem: string): Promise<void> {
  await driveFetch(token, `${API}/files/${arquivoId}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent(mensagem)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user", role: "reader", emailAddress: email.trim() }),
  });
}

export function linkDaPasta(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

// ---------- a pasta inteira ----------

export async function enviarPastaParaDrive(
  prep: Preparado,
  periodo: Periodo | null,
  aoProgredir?: (texto: string) => void,
  indices: Indices = INDICES_EMBUTIDOS,
): Promise<{ pastaId: string; link: string; arquivos: number }> {
  aoProgredir?.("Pedindo acesso ao Google…");
  const token = await obterToken();

  // exatamente os mesmos arquivos da pasta .zip
  const { nomes, arquivos } = conteudoDaPasta(prep, periodo, indices);
  const nome = nomePasta(periodo);

  aoProgredir?.("Criando a pasta…");
  const pastaId = await criarPasta(token, nome);
  const compId = await criarPasta(token, "comprovantes", pastaId);

  let enviados = 0;
  for (const a of arquivos) {
    await enviarArquivo(token, a.nome, a.texto, a.mime, pastaId);
    enviados++;
  }

  const chaves = Array.from(nomes.keys());
  let i = 0;
  for (const blobKey of chaves) {
    i++;
    aoProgredir?.(`Enviando comprovante ${i} de ${chaves.length}…`);
    const b = await obterBlob(blobKey);
    if (!b) continue;
    await enviarArquivo(token, nomes.get(blobKey)!, b, b.type || "application/octet-stream", compId);
    enviados++;
  }

  return { pastaId, link: linkDaPasta(pastaId), arquivos: enviados };
}
