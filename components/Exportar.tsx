"use client";

// Exportar: o que sai do cofre para o advogado. Tudo gerado no aparelho.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listarLog } from "@/lib/store";
import { listarLogCombinado, listarLogPagamentos } from "@/lib/pagamentos";
import { listarLogFilhos } from "@/lib/filhos";
import { obterIndices } from "@/lib/indices-cache";
import { INDICES_EMBUTIDOS, type Indices } from "@/lib/indices";
import { formatBRL, nomeMes } from "@/lib/format";
import {
  baixar,
  compartilhar,
  montarPasta,
  montarPlanilha,
  noPeriodo,
  pagamentoNoPeriodo,
  podeCompartilhar,
  preparar,
  type Periodo,
  type Preparado,
} from "@/lib/exportar";
import { compartilharCom, driveConfigurado, enviarPastaParaDrive, obterToken } from "@/lib/drive";

type Gerado = { tipo: "planilha" | "pasta"; blob: Blob; nome: string };

export default function Exportar() {
  const [prep, setPrep] = useState<Preparado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [de, setDe] = useState<string>("");
  const [ate, setAte] = useState<string>("");
  const [gerando, setGerando] = useState<"planilha" | "pasta" | null>(null);
  const [progresso, setProgresso] = useState<string>("");
  const [gerado, setGerado] = useState<Gerado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Google Drive
  const [drive, setDrive] = useState<{ estado: "ocioso" | "enviando" | "ok" | "erro"; texto?: string; link?: string; pastaId?: string }>({
    estado: "ocioso",
  });
  const [emailAdv, setEmailAdv] = useState("");
  const [acesso, setAcesso] = useState<"ocioso" | "dando" | "ok" | "erro">("ocioso");
  const [indices, setIndices] = useState<Indices>(INDICES_EMBUTIDOS);

  useEffect(() => {
    Promise.all([listarLog(), listarLogPagamentos(), listarLogCombinado(), listarLogFilhos()])
      .then(([log, logPag, logComb, logFilhos]) => {
        const p = preparar(log, logPag, logComb, logFilhos);
        setPrep(p);
        if (p.meses.length) {
          setDe(p.meses[0]);
          setAte(p.meses[p.meses.length - 1]);
        }
      })
      .catch(() => setErro("Não consegui abrir o cofre neste navegador."));
    obterIndices().then(setIndices);
  }, []);

  const periodo: Periodo | null = useMemo(() => {
    if (!prep || !de || !ate) return null;
    const tudo = de === prep.meses[0] && ate === prep.meses[prep.meses.length - 1];
    return tudo ? null : { de, ate };
  }, [prep, de, ate]);

  const selecao = useMemo(() => {
    if (!prep) return { ativas: [], retiradas: [], total: 0, comComprovante: 0, arquivos: 0, pagamentos: [], recebido: 0 };
    const ativas = prep.ativas.filter((d) => noPeriodo(d, periodo));
    const retiradas = prep.retiradas.filter((d) => noPeriodo(d, periodo));
    const pagamentos = prep.pagamentos.filter((p) => pagamentoNoPeriodo(p, periodo));
    const total = ativas.reduce((s, d) => s + d.valor_centavos, 0);
    const recebido = pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
    const comComprovante = ativas.filter((d) => d.comprovante).length;
    const arquivos = new Set([...ativas, ...pagamentos].filter((d) => d.comprovante).map((d) => d.comprovante!.blobKey)).size;
    return { ativas, retiradas, total, comComprovante, arquivos, pagamentos, recebido };
  }, [prep, periodo]);

  const compartilhavel = gerado ? podeCompartilhar(gerado.blob, gerado.nome) : false;

  async function gerarPlanilha() {
    if (!prep) return;
    setGerando("planilha");
    setAviso(null);
    try {
      const r = montarPlanilha(prep, periodo);
      setGerado({ tipo: "planilha", ...r });
    } catch {
      setAviso("Não consegui gerar a planilha. Tente de novo.");
    } finally {
      setGerando(null);
    }
  }

  async function gerarPasta() {
    if (!prep) return;
    setGerando("pasta");
    setAviso(null);
    setProgresso("");
    try {
      const r = await montarPasta(prep, periodo, (f, t) => setProgresso(`${f} de ${t} comprovantes`), indices);
      setGerado({ tipo: "pasta", ...r });
    } catch {
      setAviso("Não consegui montar a pasta. Tente de novo.");
    } finally {
      setGerando(null);
      setProgresso("");
    }
  }

  async function acaoCompartilhar() {
    if (!gerado) return;
    const ok = await compartilhar(gerado.blob, gerado.nome, "Despesas do filho — AlimentaProva");
    if (!ok) setAviso("O compartilhamento não abriu. Use Baixar e envie o arquivo pelo app que preferir.");
  }

  async function enviarDrive() {
    if (!prep) return;
    setDrive({ estado: "enviando", texto: "Preparando…" });
    setAcesso("ocioso");
    try {
      const r = await enviarPastaParaDrive(prep, periodo, (t) => setDrive({ estado: "enviando", texto: t }), indices);
      setDrive({ estado: "ok", link: r.link, pastaId: r.pastaId, texto: `${r.arquivos} arquivos enviados` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setDrive({
        estado: "erro",
        texto: /popup|fechado|access_denied/i.test(msg)
          ? "A janela do Google foi fechada antes de autorizar. Tente de novo."
          : "Não consegui enviar ao Drive. Confira a conexão e tente de novo.",
      });
    }
  }

  async function darAcesso() {
    if (!drive.pastaId || !emailAdv.trim()) return;
    setAcesso("dando");
    try {
      const token = await obterToken();
      await compartilharCom(token, drive.pastaId, emailAdv, "Pasta de despesas do filho e pensão recebida, organizada no AlimentaProva. Planilhas, comprovantes originais e LEIA-ME com os selos.");
      setAcesso("ok");
    } catch {
      setAcesso("erro");
    }
  }

  const relatorioHref = periodo ? `/relatorio?de=${periodo.de}&ate=${periodo.ate}` : "/relatorio";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">Exportar</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-10 pt-4">
        {erro && <p className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">{erro}</p>}
        {!prep && !erro && <p className="py-10 text-center text-sm text-ink-3">Abrindo o cofre…</p>}

        {prep && prep.ativas.length === 0 && (
          <p className="rounded-2xl border border-rule bg-surface px-4 py-6 text-center text-sm text-ink-3">
            Ainda não há despesas ativas para exportar.
          </p>
        )}

        {prep && prep.ativas.length > 0 && (
          <>
            {/* Período */}
            <section>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">Período</span>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-ink-3">De</span>
                  <select
                    value={de}
                    onChange={(e) => {
                      setDe(e.target.value);
                      if (e.target.value > ate) setAte(e.target.value);
                      setGerado(null);
                    }}
                    className="h-12 w-full rounded-2xl border border-rule bg-surface px-3 text-sm outline-none focus:border-accent"
                  >
                    {prep.meses.map((m) => (
                      <option key={m} value={m}>
                        {nomeMes(m)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-ink-3">Até</span>
                  <select
                    value={ate}
                    onChange={(e) => {
                      setAte(e.target.value);
                      if (e.target.value < de) setDe(e.target.value);
                      setGerado(null);
                    }}
                    className="h-12 w-full rounded-2xl border border-rule bg-surface px-3 text-sm outline-none focus:border-accent"
                  >
                    {prep.meses.map((m) => (
                      <option key={m} value={m}>
                        {nomeMes(m)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <Tile rotulo="Despesas" valor={String(selecao.ativas.length)} />
                <Tile rotulo="Parte do filho" valor={formatBRL(selecao.total)} />
                <Tile rotulo="Comprovantes" valor={`${selecao.comComprovante}/${selecao.ativas.length}`} />
              </div>
              {selecao.pagamentos.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Tile rotulo="Pensão recebida" valor={formatBRL(selecao.recebido)} />
                  <Tile rotulo="Pagamentos" valor={String(selecao.pagamentos.length)} />
                </div>
              )}
              {selecao.retiradas.length > 0 && (
                <p className="mt-2 text-[11px] text-ink-3">
                  {selecao.retiradas.length} {selecao.retiradas.length === 1 ? "despesa retirada" : "despesas retiradas"} do cofre no período
                  não {selecao.retiradas.length === 1 ? "conta" : "contam"} — {selecao.retiradas.length === 1 ? "vai" : "vão"} em arquivo
                  separado, com o motivo.
                </p>
              )}
            </section>

            {/* Saídas */}
            <section className="space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-ink-3">O que gerar</span>

              <Cartao
                titulo="Planilha"
                descricao="Uma linha por despesa: data, categoria, valor, total do comprovante, fração do filho, selo. Abre no Excel e no Google Sheets. (Os pagamentos de pensão vão na pasta completa.)"
                acao={gerando === "planilha" ? "Gerando…" : "Gerar planilha"}
                desabilitado={gerando !== null}
                onClick={gerarPlanilha}
                ativo={gerado?.tipo === "planilha"}
              />

              <Cartao
                titulo="Pasta completa"
                descricao={`Planilha de despesas${selecao.pagamentos.length ? ", planilha de pagamentos de pensão" : ""}, custo × pensão mês a mês, ${selecao.arquivos} ${selecao.arquivos === 1 ? "comprovante original renomeado" : "comprovantes originais renomeados"} (data_categoria_valor_selo) e LEIA-ME com os selos SHA-256. É a pasta que a estagiária montaria.`}
                acao={gerando === "pasta" ? `Montando… ${progresso}` : "Montar pasta (.zip)"}
                desabilitado={gerando !== null}
                onClick={gerarPasta}
                ativo={gerado?.tipo === "pasta"}
              />

              <div className={["rounded-2xl border bg-surface px-4 py-4", drive.estado === "ok" ? "border-ok/50" : "border-rule"].join(" ")}>
                <h2 className="text-sm font-semibold">Google Drive</h2>
                {!driveConfigurado() ? (
                  <p className="mt-1 text-xs text-ink-3">
                    Ainda não configurado neste site. Precisa do ID de cliente OAuth do Google (variável NEXT_PUBLIC_GOOGLE_CLIENT_ID).
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-ink-2">
                      Cria no <strong>seu</strong> Google Drive a pasta completa, já aberta (planilha, comprovantes renomeados, LEIA-ME), sem zip.
                      Depois você dá acesso ao advogado pelo e-mail dele. O AlimentaProva só enxerga a pasta que ele mesmo criou.
                    </p>
                    <button
                      type="button"
                      onClick={enviarDrive}
                      disabled={drive.estado === "enviando" || gerando !== null}
                      className="mt-3 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-white disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
                    >
                      {drive.estado === "enviando" ? drive.texto : drive.estado === "ok" ? "Enviar de novo" : "Enviar para o meu Google Drive"}
                    </button>
                    {drive.estado === "erro" && <p className="mt-2 text-xs text-risk">{drive.texto}</p>}
                    {drive.estado === "ok" && drive.link && (
                      <div className="mt-3 rounded-xl border border-ok/30 bg-ok-soft px-3 py-3">
                        <p className="text-sm font-semibold text-ok">Pasta criada no Drive · {drive.texto}</p>
                        <a href={drive.link} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-medium text-accent underline">
                          Abrir pasta no Drive
                        </a>
                        <label htmlFor="email-adv" className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                          Dar acesso de leitura ao advogado
                        </label>
                        <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                          <input
                            id="email-adv"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            placeholder="e-mail do advogado"
                            value={emailAdv}
                            onChange={(e) => {
                              setEmailAdv(e.target.value);
                              setAcesso("ocioso");
                            }}
                            className="h-11 min-w-0 rounded-xl border border-rule bg-surface px-3 text-sm outline-none focus:border-accent"
                          />
                          <button
                            type="button"
                            onClick={darAcesso}
                            disabled={acesso === "dando" || !/^\S+@\S+\.\S+$/.test(emailAdv)}
                            className="h-11 rounded-xl border border-accent bg-surface px-3 text-sm font-semibold text-accent disabled:border-rule disabled:text-ink-3 active:bg-accent-soft"
                          >
                            {acesso === "dando" ? "Dando…" : acesso === "ok" ? "Acesso dado" : "Dar acesso"}
                          </button>
                        </div>
                        {acesso === "ok" && <p className="mt-2 text-[11px] text-ink-2">O Google avisa o advogado por e-mail. Ele vê e baixa; não altera.</p>}
                        {acesso === "erro" && <p className="mt-2 text-[11px] text-risk">Não consegui dar o acesso. Confira o e-mail e tente de novo.</p>}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-2xl border border-rule bg-surface px-4 py-4">
                <h2 className="text-sm font-semibold">Relatório para imprimir ou salvar em PDF</h2>
                <p className="mt-1 text-xs text-ink-2">
                  Demonstrativo do período com totais por categoria e a lista de despesas, cada uma com o selo do comprovante. No navegador,
                  use Imprimir → Salvar como PDF.
                </p>
                <Link
                  href={relatorioHref}
                  className="mt-3 flex h-11 items-center justify-center rounded-xl border border-accent bg-surface text-sm font-semibold text-accent active:bg-accent-soft"
                >
                  Abrir relatório
                </Link>
              </div>
            </section>

            {/* Resultado */}
            {gerado && (
              <section className="rounded-2xl border border-ok/30 bg-ok-soft px-4 py-4">
                <p className="text-sm font-semibold text-ok">{gerado.tipo === "pasta" ? "Pasta pronta" : "Planilha pronta"}</p>
                <p className="mt-0.5 break-all text-xs text-ink-2">
                  {gerado.nome} · {(gerado.blob.size / 1024).toFixed(0)} KB
                </p>
                <div className={["mt-3 grid gap-2", compartilhavel ? "grid-cols-2" : "grid-cols-1"].join(" ")}>
                  {compartilhavel && (
                    <button
                      type="button"
                      onClick={acaoCompartilhar}
                      className="h-12 rounded-xl bg-accent text-sm font-semibold text-white active:bg-accent-strong"
                    >
                      Compartilhar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => baixar(gerado.blob, gerado.nome)}
                    className={[
                      "h-12 rounded-xl text-sm font-semibold",
                      compartilhavel ? "border border-accent bg-surface text-accent active:bg-accent-soft" : "bg-accent text-white active:bg-accent-strong",
                    ].join(" ")}
                  >
                    Baixar
                  </button>
                </div>
                {compartilhavel && (
                  <p className="mt-2 text-[11px] text-ink-3">Compartilhar abre WhatsApp, e-mail ou Drive para enviar direto ao advogado.</p>
                )}
              </section>
            )}

            {aviso && (
              <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
                {aviso}
              </p>
            )}

            <p className="text-[11px] text-ink-3">
              Tudo é gerado aqui no aparelho; nada sobe para servidor. Baixar os seus próprios arquivos é e sempre será grátis.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Tile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{rotulo}</div>
      <div className="tnum mt-0.5 truncate text-sm font-semibold">{valor}</div>
    </div>
  );
}

function Cartao({
  titulo,
  descricao,
  acao,
  desabilitado,
  onClick,
  ativo,
}: {
  titulo: string;
  descricao: string;
  acao: string;
  desabilitado: boolean;
  onClick: () => void;
  ativo: boolean;
}) {
  return (
    <div className={["rounded-2xl border bg-surface px-4 py-4", ativo ? "border-ok/50" : "border-rule"].join(" ")}>
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <p className="mt-1 text-xs text-ink-2">{descricao}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={desabilitado}
        className="mt-3 h-11 w-full rounded-xl bg-accent text-sm font-semibold text-white disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
      >
        {acao}
      </button>
    </div>
  );
}
