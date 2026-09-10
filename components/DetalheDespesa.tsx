"use client";

// Detalhe de uma despesa: ver, editar (= nova versão), retirar do cofre (com
// motivo) e ler o histórico completo da linhagem. Nada aqui apaga registro.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CATEGORIAS, categoria as infoCategoria } from "@/lib/categorias";
import { devolverDespesa, novaVersao, obterBlob, obterLinhagem, retirarDespesa } from "@/lib/store";
import type { CategoriaId, Despesa, FilhoAtual } from "@/lib/types";
import { formatBRL, formatBytes, formatData, formatDataHora, formatDataLonga, parseBRL } from "@/lib/format";
import { descreverRateio, parteDoFilho } from "@/lib/rateio";
import { listarFilhosComRetirados, nomeDoFilho } from "@/lib/filhos";
import RateioPainel from "./RateioPainel";
import SeletorFilho from "./SeletorFilho";

type Modo = "ver" | "editar" | "retirar";

export default function DetalheDespesa({ linhagem }: { linhagem: string }) {
  const [versoes, setVersoes] = useState<Despesa[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const atual = versoes && versoes.length > 0 ? versoes[versoes.length - 1] : null;

  const [modo, setModo] = useState<Modo>("ver");
  const [estado, setEstado] = useState<"ocioso" | "salvando" | "erro">("ocioso");
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // campos de edição
  const [valorTexto, setValorTexto] = useState("");
  const [data, setData] = useState("");
  const [categoria, setCategoria] = useState<CategoriaId>("outro");
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
  // filhos cadastrados (com retirados, para o nome de despesas antigas continuar aparecendo)
  const [filhos, setFilhos] = useState<FilhoAtual[]>([]);
  const [filhoSel, setFilhoSel] = useState<string | null>(null);
  useEffect(() => {
    listarFilhosComRetirados().then(setFilhos).catch(() => setFilhos([]));
  }, []);
  const nomesFilhos = useMemo(() => new Map(filhos.map((f) => [f.linhagem, f.nome])), [filhos]);
  const filhosAtivos = useMemo(() => filhos.filter((f) => !f.retirada), [filhos]);
  // rateio na edição: o campo Valor é o TOTAL do comprovante quando ativo
  const [rateioAtivo, setRateioAtivo] = useState(false);
  const [rateioPct, setRateioPct] = useState(50);
  const [rateioCriterio, setRateioCriterio] = useState("");
  const arquivoRef = useRef<HTMLInputElement>(null);

  // comprovante
  const [urlBlob, setUrlBlob] = useState<string | null>(null);
  const [mimeBlob, setMimeBlob] = useState<string>("");

  const carregar = useCallback(async () => {
    try {
      const v = await obterLinhagem(linhagem);
      setVersoes(v);
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
    let url: string | null = null;
    let ativo = true;
    obterBlob(blobKey).then((b) => {
      if (!ativo || !b) return;
      url = URL.createObjectURL(b);
      setUrlBlob(url);
      setMimeBlob(b.type);
    });
    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blobKey]);

  function iniciarEdicao() {
    if (!atual) return;
    // com rateio, edita-se o total do comprovante; a parte é recalculada
    const base = atual.rateio ? atual.rateio.total_centavos : atual.valor_centavos;
    setValorTexto((base / 100).toFixed(2).replace(".", ","));
    setRateioAtivo(!!atual.rateio);
    setRateioPct(atual.rateio?.percentual ?? 50);
    setRateioCriterio(atual.rateio?.criterio ?? "");
    setData(atual.data_do_fato);
    setCategoria(atual.categoria);
    setObservacao(atual.observacao ?? "");
    setFilhoSel(atual.filho ?? null);
    setMotivo("");
    setNovoArquivo(null);
    setMensagemErro(null);
    setEstado("ocioso");
    setModo("editar");
  }

  function iniciarRetirada() {
    setMotivo("");
    setMensagemErro(null);
    setEstado("ocioso");
    setModo("retirar");
  }

  function cancelar() {
    setModo("ver");
    setMensagemErro(null);
    setEstado("ocioso");
  }

  const valorCentavos = useMemo(() => parseBRL(valorTexto), [valorTexto]);
  const parteNova = useMemo(
    () => (valorCentavos === null ? null : rateioAtivo ? parteDoFilho(valorCentavos, rateioPct) : valorCentavos),
    [valorCentavos, rateioAtivo, rateioPct],
  );

  const houveMudanca = useMemo(() => {
    if (!atual) return false;
    const rateioMudou =
      rateioAtivo !== !!atual.rateio ||
      (rateioAtivo &&
        (Math.abs(rateioPct - (atual.rateio?.percentual ?? 0)) > 0.001 ||
          (rateioCriterio.trim() || undefined) !== atual.rateio?.criterio));
    return (
      parteNova !== atual.valor_centavos ||
      rateioMudou ||
      data !== atual.data_do_fato ||
      categoria !== atual.categoria ||
      (observacao.trim() || undefined) !== atual.observacao ||
      (filhoSel ?? undefined) !== atual.filho ||
      !!novoArquivo
    );
  }, [atual, parteNova, rateioAtivo, rateioPct, rateioCriterio, data, categoria, observacao, filhoSel, novoArquivo]);

  const podeGuardar = estado !== "salvando" && parteNova !== null && parteNova > 0 && !!data && houveMudanca;

  async function guardarEdicao() {
    if (!atual || !podeGuardar || valorCentavos === null || parteNova === null) return;
    setEstado("salvando");
    setMensagemErro(null);
    try {
      await novaVersao(atual, {
        valor_centavos: parteNova,
        rateio: rateioAtivo
          ? { total_centavos: valorCentavos, percentual: rateioPct, criterio: rateioCriterio.trim() || undefined }
          : null,
        data_do_fato: data,
        categoria,
        observacao,
        filho: filhoSel,
        motivo,
        arquivo: novoArquivo,
      });
      await carregar();
      setModo("ver");
      setEstado("ocioso");
    } catch {
      setEstado("erro");
      setMensagemErro("Não consegui guardar a alteração. Tente de novo.");
    }
  }

  async function confirmarRetirada() {
    if (!atual || !motivo.trim()) return;
    setEstado("salvando");
    setMensagemErro(null);
    try {
      await retirarDespesa(atual, motivo);
      await carregar();
      setModo("ver");
      setEstado("ocioso");
    } catch {
      setEstado("erro");
      setMensagemErro("Não consegui retirar. Tente de novo.");
    }
  }

  async function devolver() {
    if (!atual) return;
    setEstado("salvando");
    try {
      await devolverDespesa(atual);
      await carregar();
      setEstado("ocioso");
    } catch {
      setEstado("erro");
      setMensagemErro("Não consegui devolver ao cofre. Tente de novo.");
    }
  }

  // ---------- render ----------

  if (erroCarga) {
    return (
      <Moldura titulo="Despesa">
        <p className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">{erroCarga}</p>
      </Moldura>
    );
  }
  if (versoes === null) {
    return (
      <Moldura titulo="Despesa">
        <p className="py-10 text-center text-sm text-ink-3">Abrindo o registro…</p>
      </Moldura>
    );
  }
  if (!atual) {
    return (
      <Moldura titulo="Despesa">
        <p className="py-10 text-center text-sm text-ink-3">Este registro não está neste aparelho.</p>
      </Moldura>
    );
  }

  const cat = infoCategoria(atual.categoria);
  const ehImagem = mimeBlob.startsWith("image/");
  const titulo = modo === "editar" ? "Editar despesa" : modo === "retirar" ? "Retirar do cofre" : "Despesa";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        {modo === "ver" ? (
          <Link href="/" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
            ← Voltar
          </Link>
        ) : (
          <button type="button" onClick={cancelar} className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50">
            Cancelar
          </button>
        )}
        <h1 className="text-base font-semibold">{titulo}</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-40 pt-4">
        {/* Retirada: aviso no topo */}
        {atual.retirada && (
          <div className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            <p className="font-semibold">Retirada do cofre em {formatDataHora(atual.criado_em)}</p>
            {atual.motivo && <p className="mt-0.5">Motivo: {atual.motivo}</p>}
            <p className="mt-1 text-xs opacity-80">Não conta nos totais nem entra em exportações. O registro continua no histórico.</p>
          </div>
        )}

        {/* Comprovante */}
        <section aria-labelledby="lbl-comp">
          <div className="mb-2 flex items-baseline justify-between">
            <span id="lbl-comp" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Comprovante
            </span>
            {atual.comprovante && urlBlob && (
              <a href={urlBlob} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent">
                Abrir original
              </a>
            )}
          </div>

          {atual.comprovante ? (
            <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
              {urlBlob && ehImagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlBlob} alt="Comprovante" className="max-h-72 w-full bg-zinc-100 object-contain" />
              ) : (
                <div className="flex h-24 items-center justify-center bg-zinc-100 text-xs font-medium text-ink-3">
                  {urlBlob ? "PDF" : "carregando…"}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-ink-3">
                <span className="truncate">
                  {atual.comprovante.nomeOriginal || "foto"} · {formatBytes(atual.comprovante.tamanho)}
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
                <span className="text-[11px] opacity-80">{novoArquivo ? formatBytes(novoArquivo.size) : "foto, print ou PDF"}</span>
              </button>
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setNovoArquivo(e.target.files?.[0] ?? null)}
              />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-risk/40 bg-risk-soft/40 px-4 py-4 text-center text-sm text-risk">
              Sem comprovante. Toque em Editar para anexar.
            </div>
          )}
        </section>

        {modo === "ver" && (
          <>
            {/* Dados */}
            <section className="rounded-2xl border border-rule bg-surface">
              <div className="flex items-baseline justify-between px-4 pt-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Valor</span>
                {atual.leitura && (
                  <span className="text-[11px] font-medium text-ink-3">
                    {atual.leitura.confirmado_sem_alteracao ? "lido do comprovante e confirmado" : "lido do comprovante, ajustado por você"}
                  </span>
                )}
              </div>
              <div className={["tnum px-4 pb-3 text-3xl font-semibold", atual.retirada ? "line-through text-ink-3" : ""].join(" ")}>
                {formatBRL(atual.valor_centavos)}
                {atual.rateio && (
                  <span className="mt-0.5 block text-sm font-medium text-ink-2">
                    parte do filho · {descreverRateio(atual.rateio, formatBRL)}
                  </span>
                )}
              </div>
              <dl className="divide-y divide-rule border-t border-rule text-sm">
                <Linha rotulo="Categoria">
                  <span className="inline-flex items-center gap-2">
                    <span className={["h-2 w-2 rounded-full", cat.dot].join(" ")} aria-hidden="true" />
                    {cat.nome}
                  </span>
                </Linha>
                {(filhos.length > 0 || atual.filho) && <Linha rotulo="De quem">{nomeDoFilho(atual.filho, nomesFilhos, filhosAtivos.length > 1 ? "todos" : "da família")}</Linha>}
                <Linha rotulo="Data da despesa">{formatDataLonga(atual.data_do_fato)}</Linha>
                <Linha rotulo="Entrou no cofre">{formatDataHora(versoes[0].criado_em)}</Linha>
                {atual.observacao && <Linha rotulo="Observação">{atual.observacao}</Linha>}
                {atual.lote && (
                  <Linha rotulo="Origem">Print com vários lançamentos — este é um deles, registrado separado.</Linha>
                )}
              </dl>
            </section>

            {/* Histórico */}
            <section>
              <button
                type="button"
                onClick={() => setHistoricoAberto((v) => !v)}
                className="flex w-full items-center justify-between rounded-2xl border border-rule bg-surface px-4 py-3 text-left"
                aria-expanded={historicoAberto}
              >
                <span className="text-sm font-medium">
                  Histórico · {versoes.length} {versoes.length === 1 ? "versão" : "versões"}
                </span>
                <span className="text-ink-3" aria-hidden="true">
                  {historicoAberto ? "▴" : "▾"}
                </span>
              </button>
              {historicoAberto && (
                <ol className="mt-2 space-y-2">
                  {versoes.map((v, i) => (
                    <li key={v.id} className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">v{v.versao}</span>
                        <span className="tnum text-xs text-ink-3">{formatDataHora(v.criado_em)}</span>
                      </div>
                      <p className="mt-0.5 text-ink-2">{descreverMudanca(versoes[i - 1], v, nomesFilhos)}</p>
                      {v.motivo && i > 0 && <p className="mt-0.5 text-xs text-ink-3">Motivo: {v.motivo}</p>}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-2 text-[11px] text-ink-3">
                Cada versão fica gravada com data e hora. É isso que permite mostrar, depois, que o registro não foi manipulado.
              </p>
            </section>
          </>
        )}

        {modo === "editar" && (
          <>
            <section>
              <label htmlFor="valor" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                {rateioAtivo ? "Total do comprovante" : "Valor"}
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-rule bg-surface px-4 focus-within:border-accent">
                <span className="text-lg font-medium text-ink-3">R$</span>
                <input
                  id="valor"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                  className="tnum h-14 w-full bg-transparent text-2xl font-semibold outline-none"
                />
              </div>
              {valorTexto && (valorCentavos === null || valorCentavos <= 0) && (
                <p className="mt-1 text-xs text-risk">Digite um valor, por exemplo 89,90</p>
              )}
              <div className="mt-3">
                <RateioPainel
                  totalCentavos={valorCentavos}
                  ativo={rateioAtivo}
                  percentual={rateioPct}
                  criterio={rateioCriterio}
                  onAtivoChange={setRateioAtivo}
                  onPercentualChange={setRateioPct}
                  onCriterioChange={setRateioCriterio}
                />
              </div>
            </section>

            <section>
              <label htmlFor="data" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Data da despesa
              </label>
              <input
                id="data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="tnum h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
              />
            </section>

            <section aria-labelledby="lbl-cat">
              <span id="lbl-cat" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Categoria
              </span>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIAS.map((c) => {
                  const ativa = categoria === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoria(c.id)}
                      aria-pressed={ativa}
                      className={[
                        "flex min-h-[52px] items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-colors",
                        ativa ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink active:bg-rule/40",
                      ].join(" ")}
                    >
                      <span className={["h-2.5 w-2.5 shrink-0 rounded-full", ativa ? "bg-white" : c.dot].join(" ")} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight">{c.nome}</span>
                        <span className={["block truncate text-[11px] leading-tight", ativa ? "text-white/80" : "text-ink-3"].join(" ")}>
                          {c.exemplos}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {filhosAtivos.length > 0 && <SeletorFilho filhos={filhosAtivos} valor={filhoSel} onChange={setFilhoSel} />}

            <section>
              <label htmlFor="obs" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Observação <span className="font-normal normal-case">(opcional)</span>
              </label>
              <textarea
                id="obs"
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: material escolar do 2º semestre"
                className="w-full rounded-2xl border border-rule bg-surface px-4 py-3 text-base outline-none focus:border-accent"
              />
            </section>

            <section>
              <label htmlFor="motivo" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Por que está alterando? <span className="font-normal normal-case">(opcional, fica no histórico)</span>
              </label>
              <input
                id="motivo"
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: digitei o valor errado"
                className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
              />
            </section>
          </>
        )}

        {modo === "retirar" && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm text-ink-2">
              <p>
                Retirar tira esta despesa dos totais e das exportações, mas <strong>não apaga</strong> nada: o registro e todas as
                versões continuam no histórico, com a data e o motivo da retirada. Você pode devolver ao cofre depois.
              </p>
            </div>
            <label htmlFor="motivo-ret" className="block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Motivo <span className="font-normal normal-case">(obrigatório)</span>
            </label>
            <textarea
              id="motivo-ret"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: compra minha, não é do meu filho · lançada duas vezes · valor errado, registrei de novo"
              className="w-full rounded-2xl border border-rule bg-surface px-4 py-3 text-base outline-none focus:border-accent"
            />
          </section>
        )}

        {mensagemErro && (
          <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {mensagemErro}
          </p>
        )}
      </main>

      {/* Ações fixas no alcance do polegar */}
      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        {modo === "ver" && !atual.retirada && (
          <>
            <button
              type="button"
              onClick={iniciarEdicao}
              className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm active:bg-accent-strong"
            >
              Editar despesa
            </button>
            <button type="button" onClick={iniciarRetirada} className="mt-2 block w-full py-1 text-center text-sm font-medium text-risk">
              Retirar do cofre
            </button>
          </>
        )}
        {modo === "ver" && atual.retirada && (
          <>
            <button
              type="button"
              onClick={devolver}
              disabled={estado === "salvando"}
              className="h-14 w-full rounded-2xl border border-accent bg-surface text-base font-semibold text-accent disabled:opacity-60 active:bg-accent-soft"
            >
              {estado === "salvando" ? "Devolvendo…" : "Devolver ao cofre"}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-3">Volta a contar nos totais. Fica registrado como nova versão.</p>
          </>
        )}
        {modo === "editar" && (
          <>
            <button
              type="button"
              onClick={guardarEdicao}
              disabled={!podeGuardar}
              className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
            >
              {estado === "salvando" ? "Guardando…" : houveMudanca ? "Guardar nova versão" : "Nada foi alterado"}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-3">
              A versão anterior continua no histórico. Esta passa a ser a atual.
            </p>
          </>
        )}
        {modo === "retirar" && (
          <>
            <button
              type="button"
              onClick={confirmarRetirada}
              disabled={estado === "salvando" || !motivo.trim()}
              className="h-14 w-full rounded-2xl bg-risk text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3"
            >
              {estado === "salvando" ? "Retirando…" : motivo.trim() ? "Retirar do cofre" : "Escreva o motivo para retirar"}
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
        <Link href="/" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
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

/** Texto curto do que mudou entre uma versão e a anterior. */
function descreverMudanca(anterior: Despesa | undefined, v: Despesa, nomes: Map<string, string>): string {
  if (!anterior) return v.comprovante ? "Registrada com comprovante" : "Registrada sem comprovante";
  if (v.retirada && !anterior.retirada) return "Retirada do cofre";
  if (!v.retirada && anterior.retirada) return "Devolvida ao cofre";
  const partes: string[] = [];
  if (v.valor_centavos !== anterior.valor_centavos) partes.push(`valor ${formatBRL(anterior.valor_centavos)} → ${formatBRL(v.valor_centavos)}`);
  if (v.data_do_fato !== anterior.data_do_fato) partes.push(`data ${formatData(anterior.data_do_fato)} → ${formatData(v.data_do_fato)}`);
  if (v.categoria !== anterior.categoria)
    partes.push(`categoria ${infoCategoria(anterior.categoria).nome} → ${infoCategoria(v.categoria).nome}`);
  if ((v.filho ?? "") !== (anterior.filho ?? "")) partes.push(`de quem ${nomeDoFilho(anterior.filho, nomes)} → ${nomeDoFilho(v.filho, nomes)}`);
  const rA = anterior.rateio ? descreverRateio(anterior.rateio, formatBRL) : null;
  const rV = v.rateio ? descreverRateio(v.rateio, formatBRL) : null;
  if (rA !== rV) partes.push(rV ? `divisão ${rA ? `${rA} → ` : ""}${rV}` : "divisão removida");
  if ((v.observacao ?? "") !== (anterior.observacao ?? "")) partes.push("observação alterada");
  if (v.comprovante?.blobKey !== anterior.comprovante?.blobKey) partes.push(anterior.comprovante ? "comprovante trocado" : "comprovante anexado");
  if (partes.length === 0) return "Sem mudança nos campos";
  return partes.join(" · ").replace(/^./, (c) => c.toUpperCase());
}
