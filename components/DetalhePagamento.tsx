"use client";

// Um pagamento de pensão: ver, editar (nova versão), retirar (com motivo),
// devolver, histórico. Espelho de DetalheDespesa, sem categoria e sem rateio.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { obterBlob } from "@/lib/store";
import { FORMAS, devolverPagamento, nomeForma, novaVersaoPagamento, obterLinhagemPagamento, retirarPagamento } from "@/lib/pagamentos";
import { mesAnterior, proximoMes } from "@/lib/pensao";
import { formatBRL, formatBytes, formatData, formatDataHora, formatDataLonga, nomeMes, parseBRL } from "@/lib/format";
import type { FormaPagamento, Pagamento } from "@/lib/types";

type Modo = "ver" | "editar" | "retirar";

export default function DetalhePagamento({ linhagem }: { linhagem: string }) {
  const [versoes, setVersoes] = useState<Pagamento[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const atual = versoes && versoes.length > 0 ? versoes[versoes.length - 1] : null;

  const [modo, setModo] = useState<Modo>("ver");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const [valorTexto, setValorTexto] = useState("");
  const [data, setData] = useState("");
  const [referencia, setReferencia] = useState("");
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState("");

  const carregar = useCallback(async () => {
    try {
      setVersoes(await obterLinhagemPagamento(linhagem));
    } catch {
      setErroCarga("Não consegui abrir este registro neste navegador.");
    }
  }, [linhagem]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const blobKey = atual?.comprovante?.blobKey;
  useEffect(() => {
    if (!blobKey) return;
    let u: string | null = null;
    let ativo = true;
    obterBlob(blobKey).then((b) => {
      if (!ativo || !b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
      setMime(b.type);
    });
    return () => {
      ativo = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [blobKey]);

  function abrirEdicao() {
    if (!atual) return;
    setValorTexto((atual.valor_centavos / 100).toFixed(2).replace(".", ","));
    setData(atual.data_do_fato);
    setReferencia(atual.referencia);
    setForma(atual.forma ?? null);
    setObservacao(atual.observacao ?? "");
    setMotivo("");
    setNovoArquivo(null);
    setErro(null);
    setModo("editar");
  }

  const valor = useMemo(() => parseBRL(valorTexto), [valorTexto]);
  const mudou = useMemo(() => {
    if (!atual) return false;
    return (
      valor !== atual.valor_centavos ||
      data !== atual.data_do_fato ||
      referencia !== atual.referencia ||
      (forma ?? undefined) !== atual.forma ||
      (observacao.trim() || undefined) !== atual.observacao ||
      !!novoArquivo
    );
  }, [atual, valor, data, referencia, forma, observacao, novoArquivo]);
  const podeGuardar = !salvando && valor !== null && valor > 0 && !!data && mudou;

  async function guardar() {
    if (!atual || !podeGuardar || valor === null) return;
    setSalvando(true);
    setErro(null);
    try {
      await novaVersaoPagamento(atual, { valor_centavos: valor, data_do_fato: data, referencia, forma: forma ?? undefined, observacao, motivo, arquivo: novoArquivo });
      await carregar();
      setModo("ver");
    } catch {
      setErro("Não consegui guardar a alteração. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function retirar() {
    if (!atual || !motivo.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await retirarPagamento(atual, motivo);
      await carregar();
      setModo("ver");
    } catch {
      setErro("Não consegui retirar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function devolver() {
    if (!atual) return;
    setSalvando(true);
    try {
      await devolverPagamento(atual);
      await carregar();
    } catch {
      setErro("Não consegui devolver ao cofre. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (erroCarga)
    return (
      <Moldura titulo="Pagamento">
        <p className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">{erroCarga}</p>
      </Moldura>
    );
  if (versoes === null)
    return (
      <Moldura titulo="Pagamento">
        <p className="py-10 text-center text-sm text-ink-3">Abrindo o registro…</p>
      </Moldura>
    );
  if (!atual)
    return (
      <Moldura titulo="Pagamento">
        <p className="py-10 text-center text-sm text-ink-3">Este registro não está neste aparelho.</p>
      </Moldura>
    );

  const ehImagem = mime.startsWith("image/");
  const titulo = modo === "editar" ? "Editar pagamento" : modo === "retirar" ? "Retirar do cofre" : "Pagamento";
  const mesesRef = referencia ? [mesAnterior(mesAnterior(referencia)), mesAnterior(referencia), referencia, proximoMes(referencia)] : [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        {modo === "ver" ? (
          <Link href="/pensao" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
            ← Voltar
          </Link>
        ) : (
          <button type="button" onClick={() => setModo("ver")} className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50">
            Cancelar
          </button>
        )}
        <h1 className="text-base font-semibold">{titulo}</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-40 pt-4">
        {atual.retirada && (
          <div className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            <p className="font-semibold">Retirado do cofre em {formatDataHora(atual.criado_em)}</p>
            {atual.motivo && <p className="mt-0.5">Motivo: {atual.motivo}</p>}
            <p className="mt-1 text-xs opacity-80">Não conta nos totais nem entra em exportações. O registro continua no histórico.</p>
          </div>
        )}

        <section aria-labelledby="lbl-comp">
          <div className="mb-2 flex items-baseline justify-between">
            <span id="lbl-comp" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Comprovante
            </span>
            {atual.comprovante && url && (
              <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent">
                Abrir original
              </a>
            )}
          </div>
          {atual.comprovante ? (
            <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
              {url && ehImagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="Comprovante" className="max-h-72 w-full bg-zinc-100 object-contain" />
              ) : (
                <div className="flex h-24 items-center justify-center bg-zinc-100 text-xs font-medium text-ink-3">{url ? "PDF" : "carregando…"}</div>
              )}
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-ink-3">
                <span className="truncate">
                  {atual.comprovante.nomeOriginal || "print"} · {formatBytes(atual.comprovante.tamanho)}
                </span>
                <span className="tnum shrink-0 font-mono text-ok" title={`SHA-256 ${atual.comprovante.sha256}`}>
                  selo {atual.comprovante.sha256.slice(0, 10)}…
                </span>
              </div>
            </div>
          ) : modo === "editar" ? (
            <>
              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/60 text-accent active:bg-accent-soft"
              >
                <span className="text-sm font-semibold">{novoArquivo ? novoArquivo.name || "arquivo escolhido" : "Anexar comprovante"}</span>
                <span className="text-[11px] opacity-80">{novoArquivo ? formatBytes(novoArquivo.size) : "print, foto ou PDF"}</span>
              </button>
              <input ref={arquivoRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setNovoArquivo(e.target.files?.[0] ?? null)} />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-risk/40 bg-risk-soft/40 px-4 py-4 text-center text-sm text-risk">Sem comprovante. Toque em Editar para anexar.</div>
          )}
        </section>

        {modo === "ver" && (
          <>
            <section className="rounded-2xl border border-rule bg-surface">
              <div className="flex items-baseline justify-between px-4 pt-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Valor recebido</span>
                {atual.leitura && (
                  <span className="text-[11px] font-medium text-ink-3">
                    {atual.leitura.confirmado_sem_alteracao ? "lido do comprovante e confirmado" : "lido do comprovante, ajustado por você"}
                  </span>
                )}
              </div>
              <div className={["tnum px-4 pb-3 text-3xl font-semibold", atual.retirada ? "line-through text-ink-3" : ""].join(" ")}>{formatBRL(atual.valor_centavos)}</div>
              <dl className="divide-y divide-rule border-t border-rule text-sm">
                <Linha rotulo="Pensão de">{nomeMes(atual.referencia)}</Linha>
                <Linha rotulo="Entrou em">{formatDataLonga(atual.data_do_fato)}</Linha>
                {atual.forma && <Linha rotulo="Como veio">{nomeForma(atual.forma)}</Linha>}
                <Linha rotulo="Registrado no cofre">{formatDataHora(versoes[0].criado_em)}</Linha>
                {atual.observacao && <Linha rotulo="Observação">{atual.observacao}</Linha>}
              </dl>
            </section>

            <section>
              <button
                type="button"
                onClick={() => setMostrarHistorico((v) => !v)}
                className="flex w-full items-center justify-between rounded-2xl border border-rule bg-surface px-4 py-3 text-left"
                aria-expanded={mostrarHistorico}
              >
                <span className="text-sm font-medium">
                  Histórico · {versoes.length} {versoes.length === 1 ? "versão" : "versões"}
                </span>
                <span className="text-ink-3" aria-hidden="true">
                  {mostrarHistorico ? "▴" : "▾"}
                </span>
              </button>
              {mostrarHistorico && (
                <ol className="mt-2 space-y-2">
                  {versoes.map((v, i) => (
                    <li key={v.id} className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">v{v.versao}</span>
                        <span className="tnum text-xs text-ink-3">{formatDataHora(v.criado_em)}</span>
                      </div>
                      <p className="mt-0.5 text-ink-2">{descreverMudanca(versoes[i - 1], v)}</p>
                      {v.motivo && i > 0 && <p className="mt-0.5 text-xs text-ink-3">Motivo: {v.motivo}</p>}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-2 text-[11px] text-ink-3">Cada versão fica gravada com data e hora. É isso que permite mostrar, depois, que o registro não foi manipulado.</p>
            </section>
          </>
        )}

        {modo === "editar" && (
          <>
            <section>
              <label htmlFor="valor" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Valor recebido
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-rule bg-surface px-4 focus-within:border-accent">
                <span className="text-lg font-medium text-ink-3">R$</span>
                <input id="valor" type="text" inputMode="decimal" autoComplete="off" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} className="tnum h-14 w-full bg-transparent text-2xl font-semibold outline-none" />
              </div>
              {valorTexto && (valor === null || valor <= 0) && <p className="mt-1 text-xs text-risk">Digite um valor, por exemplo 1500,00</p>}
            </section>
            <div className="grid grid-cols-2 gap-3">
              <section>
                <label htmlFor="data" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Entrou em
                </label>
                <input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="tnum h-12 w-full rounded-2xl border border-rule bg-surface px-3 text-base outline-none focus:border-accent" />
              </section>
              <section>
                <label htmlFor="ref" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Pensão de
                </label>
                <select id="ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} className="h-12 w-full rounded-2xl border border-rule bg-surface px-3 text-base outline-none focus:border-accent">
                  {mesesRef.map((m) => (
                    <option key={m} value={m}>
                      {nomeMes(m)}
                    </option>
                  ))}
                </select>
              </section>
            </div>
            <section aria-labelledby="lbl-forma">
              <span id="lbl-forma" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Como veio
              </span>
              <div className="flex flex-wrap gap-2">
                {FORMAS.map((f) => {
                  const sel = forma === f.id;
                  return (
                    <button key={f.id} type="button" onClick={() => setForma(sel ? null : f.id)} aria-pressed={sel} className={["h-10 rounded-xl border px-3 text-sm font-semibold", sel ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink"].join(" ")}>
                      {f.nome}
                    </button>
                  );
                })}
              </div>
            </section>
            <section>
              <label htmlFor="obs" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Quem pagou / observação <span className="font-normal normal-case">(opcional)</span>
              </label>
              <input id="obs" type="text" value={observacao} onChange={(e) => setObservacao(e.target.value)} className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent" />
            </section>
            <section>
              <label htmlFor="motivo" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Por que está alterando? <span className="font-normal normal-case">(opcional, fica no histórico)</span>
              </label>
              <input id="motivo" type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: era a pensão de agosto, não de setembro" className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent" />
            </section>
          </>
        )}

        {modo === "retirar" && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm text-ink-2">
              <p>
                Retirar tira este pagamento das contas e das exportações, mas <strong>não apaga</strong> nada: o registro e todas as versões continuam no
                histórico, com a data e o motivo. Você pode devolver ao cofre depois.
              </p>
            </div>
            <label htmlFor="motivo-ret" className="block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Motivo <span className="font-normal normal-case">(obrigatório)</span>
            </label>
            <textarea id="motivo-ret" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: lançado duas vezes · não era pensão, era outra transferência" className="w-full rounded-2xl border border-rule bg-surface px-4 py-3 text-base outline-none focus:border-accent" />
          </section>
        )}

        {erro && (
          <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {erro}
          </p>
        )}
      </main>

      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        {modo === "ver" && !atual.retirada && (
          <>
            <button type="button" onClick={abrirEdicao} className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm active:bg-accent-strong">
              Editar pagamento
            </button>
            <button
              type="button"
              onClick={() => {
                setMotivo("");
                setErro(null);
                setModo("retirar");
              }}
              className="mt-2 block w-full py-1 text-center text-sm font-medium text-risk"
            >
              Retirar do cofre
            </button>
          </>
        )}
        {modo === "ver" && atual.retirada && (
          <>
            <button type="button" onClick={devolver} disabled={salvando} className="h-14 w-full rounded-2xl border border-accent bg-surface text-base font-semibold text-accent disabled:opacity-60 active:bg-accent-soft">
              {salvando ? "Devolvendo…" : "Devolver ao cofre"}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-3">Volta a contar. Fica registrado como nova versão.</p>
          </>
        )}
        {modo === "editar" && (
          <>
            <button type="button" onClick={guardar} disabled={!podeGuardar} className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong">
              {salvando ? "Guardando…" : mudou ? "Guardar nova versão" : "Nada foi alterado"}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-3">A versão anterior continua no histórico. Esta passa a ser a atual.</p>
          </>
        )}
        {modo === "retirar" && (
          <>
            <button type="button" onClick={retirar} disabled={salvando || !motivo.trim()} className="h-14 w-full rounded-2xl bg-risk text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3">
              {salvando ? "Retirando…" : motivo.trim() ? "Retirar do cofre" : "Escreva o motivo para retirar"}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-3">Nada é apagado. Dá para devolver depois.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Moldura({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/pensao" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">{titulo}</h1>
        <span className="w-16" aria-hidden="true" />
      </header>
      <main className="flex-1 px-4 pt-4">{children}</main>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-ink-3">{rotulo}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function descreverMudanca(anterior: Pagamento | undefined, v: Pagamento): string {
  if (!anterior) return v.comprovante ? "Registrado com comprovante" : "Registrado sem comprovante";
  if (v.retirada && !anterior.retirada) return "Retirado do cofre";
  if (!v.retirada && anterior.retirada) return "Devolvido ao cofre";
  const m: string[] = [];
  if (v.valor_centavos !== anterior.valor_centavos) m.push(`valor ${formatBRL(anterior.valor_centavos)} → ${formatBRL(v.valor_centavos)}`);
  if (v.data_do_fato !== anterior.data_do_fato) m.push(`data ${formatData(anterior.data_do_fato)} → ${formatData(v.data_do_fato)}`);
  if (v.referencia !== anterior.referencia) m.push(`pensão de ${nomeMes(anterior.referencia).toLowerCase()} → ${nomeMes(v.referencia).toLowerCase()}`);
  if (v.forma !== anterior.forma) m.push(`forma ${nomeForma(anterior.forma) || "—"} → ${nomeForma(v.forma) || "—"}`);
  if ((v.observacao ?? "") !== (anterior.observacao ?? "")) m.push("observação alterada");
  if (v.comprovante?.blobKey !== anterior.comprovante?.blobKey) m.push(anterior.comprovante ? "comprovante trocado" : "comprovante anexado");
  return m.length === 0 ? "Sem mudança nos campos" : m.join(" · ").replace(/^./, (c) => c.toUpperCase());
}
