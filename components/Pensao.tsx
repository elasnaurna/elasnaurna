"use client";

// Aba Pensão: o que ENTRA. Valor combinado, gráfico custo × pensão, e os
// pagamentos mês a mês. Retirados ficam à parte, nunca somem.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CabecalhoCofre from "./CabecalhoCofre";
import GraficoCustoPensao from "./GraficoCustoPensao";
import { listarAtuais, obterBlob } from "@/lib/store";
import { listarLogCombinado, listarPagamentosAtuais, nomeForma } from "@/lib/pagamentos";
import { combinadoAtual, descreverCombinado, descreverMes, diasAposVencimento, mesAtual, mesesPensao, serieCustoPensao, valorDoCombinado } from "@/lib/pensao";
import { calcularAtrasados, PARAMETROS_PADRAO } from "@/lib/atrasados";
import { INDICES_EMBUTIDOS, type Indices } from "@/lib/indices";
import { obterIndices } from "@/lib/indices-cache";
import { formatBRL, formatData, hojeISO, nomeMes } from "@/lib/format";
import type { Combinado, DespesaAtual, PagamentoAtual } from "@/lib/types";

export default function Pensao() {
  const params = useSearchParams();
  const salvo = params.get("salvo") === "1";

  const [pagamentos, setPagamentos] = useState<PagamentoAtual[] | null>(null);
  const [despesas, setDespesas] = useState<DespesaAtual[]>([]);
  const [logCombinado, setLogCombinado] = useState<Combinado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarAviso, setMostrarAviso] = useState(salvo);
  const [mostrarRetirados, setMostrarRetirados] = useState(false);
  const [indices, setIndices] = useState<Indices>(INDICES_EMBUTIDOS);

  useEffect(() => {
    const carregar = () =>
      Promise.all([listarPagamentosAtuais(), listarAtuais(), listarLogCombinado()])
        .then(([p, d, c]) => {
          setPagamentos(p);
          setDespesas(d);
          setLogCombinado(c);
        })
        .catch(() => setErro("Não consegui abrir o cofre neste navegador. Tente fora do modo anônimo."));
    carregar();
    obterIndices().then(setIndices);
    window.addEventListener("cofre:sincronizou", carregar);
    return () => window.removeEventListener("cofre:sincronizou", carregar);
  }, []);

  useEffect(() => {
    if (!mostrarAviso) return;
    const t = setTimeout(() => setMostrarAviso(false), 2500);
    return () => clearTimeout(t);
  }, [mostrarAviso]);

  const combinado = useMemo(() => combinadoAtual(logCombinado), [logCombinado]);
  const ativos = useMemo(() => (pagamentos ?? []).filter((p) => !p.retirada), [pagamentos]);
  const retirados = useMemo(() => (pagamentos ?? []).filter((p) => p.retirada), [pagamentos]);
  const meses = useMemo(() => mesesPensao(pagamentos ?? [], logCombinado), [pagamentos, logCombinado]);
  const serie = useMemo(() => serieCustoPensao(despesas, pagamentos ?? [], logCombinado, 12), [despesas, pagamentos, logCombinado]);
  const atrasados = useMemo(
    () => (combinado ? calcularAtrasados(meses, indices, { ...PARAMETROS_PADRAO, dataCalculo: hojeISO() }) : null),
    [combinado, meses, indices],
  );

  const ano = String(new Date().getFullYear());
  const recebidoAno = ativos.filter((p) => p.referencia.startsWith(ano)).reduce((s, p) => s + p.valor_centavos, 0);
  const comComprovante = ativos.filter((p) => p.comprovante).length;
  const vazio = pagamentos !== null && pagamentos.length === 0 && !combinado;

  return (
    <div className="flex min-h-screen flex-col">
      <CabecalhoCofre aba="pensao" />

      {mostrarAviso && (
        <div role="status" className="mx-4 mt-3 rounded-2xl border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">
          Pagamento guardado no cofre, com data e hora.
        </div>
      )}

      <main className="flex-1 px-4 pb-32 pt-4">
        {erro && <p className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">{erro}</p>}
        {pagamentos === null && !erro && <p className="py-10 text-center text-sm text-ink-3">Abrindo o cofre…</p>}

        {vazio && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <EntradaIcon />
            </div>
            <h2 className="text-lg font-semibold">Nenhum pagamento registrado</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-ink-2">
              Cada pensão que entrar, com o print do Pix ou do extrato, guardada com data. Ao lado das despesas, mostra o que a
              pensão cobre — e o que não cobre.
            </p>
            <Link href="/pensao/combinado" className="mt-5 inline-block text-sm font-medium text-accent">
              Definir o valor combinado da pensão
            </Link>
          </div>
        )}

        {pagamentos !== null && !vazio && (
          <>
            {combinado ? (
              <Link href="/pensao/combinado" className="mb-3 flex items-center justify-between rounded-2xl border border-rule bg-surface px-4 py-3 active:bg-rule/40">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Valor combinado</div>
                  <div className="tnum mt-0.5 text-base font-semibold">
                    {formatBRL(valorDoCombinado(combinado, mesAtual()).valor)}
                    <span className="ml-2 text-xs font-medium text-ink-2">
                      {combinado.modo === "sm" ? `${descreverCombinado(combinado, formatBRL)} · ` : ""}vence dia {combinado.dia_vencimento} · desde{" "}
                      {nomeMes(combinado.vigente_desde).toLowerCase()}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-medium text-accent">alterar</span>
              </Link>
            ) : (
              <Link href="/pensao/combinado" className="mb-3 block rounded-2xl border border-dashed border-accent/40 bg-accent-soft/40 px-4 py-3 active:bg-accent-soft">
                <div className="text-sm font-semibold text-accent">Definir o valor combinado da pensão</div>
                <div className="mt-0.5 text-xs text-ink-2">Com o valor fixado, cada mês mostra o que era devido e o que faltou.</div>
              </Link>
            )}

            <div className="mb-3 grid grid-cols-2 gap-2">
              <Tile rotulo={`Recebido em ${ano}`} valor={formatBRL(recebidoAno)} />
              <Tile rotulo="Com comprovante" valor={`${comComprovante} de ${ativos.length}`} />
            </div>

            {atrasados && atrasados.parcelas.length > 0 && (
              <Link href="/pensao/atrasados" className="mb-3 flex items-center justify-between rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 active:bg-risk-soft/70">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-risk">Em aberto · {atrasados.parcelas.length} {atrasados.parcelas.length === 1 ? "mês" : "meses"}</div>
                  <div className="tnum mt-0.5 text-base font-semibold text-ink">
                    {formatBRL(atrasados.total)}
                    <span className="ml-2 text-xs font-medium text-ink-2">atualizado ({formatBRL(atrasados.totalAberto)} original)</span>
                  </div>
                </div>
                <span className="text-sm font-medium text-risk">memória de cálculo ›</span>
              </Link>
            )}

            {serie.length > 0 && (
              <section className="mb-5 rounded-2xl border border-rule bg-surface px-4 py-3">
                <h2 className="text-sm font-semibold">Custo do filho × pensão</h2>
                <p className="mb-3 text-[11px] text-ink-3">Por mês: a parte do filho nas despesas registradas e o que entrou de pensão. Toque num mês.</p>
                <GraficoCustoPensao serie={serie} />
              </section>
            )}

            {meses.map((m) => {
              const desc = descreverMes(m, formatBRL);
              return (
                <section key={m.mes} className="mb-5">
                  <div className="mb-1 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-ink-2">{nomeMes(m.mes)}</h2>
                    <span className="tnum text-sm font-medium">{m.recebido > 0 ? formatBRL(m.recebido) : "—"}</span>
                  </div>
                  {desc.texto && (
                    <p className={["mb-2 text-[11px]", desc.tom === "risco" ? "text-risk" : desc.tom === "ok" ? "text-ok" : "text-ink-3"].join(" ")}>{desc.texto}</p>
                  )}
                  {m.pagamentos.length > 0 && (
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
                      {m.pagamentos.map((p) => (
                        <ItemPagamento key={p.id} p={p} diaVencimento={m.diaVencimento} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}

            {retirados.length > 0 && (
              <section className="mb-6">
                <button type="button" onClick={() => setMostrarRetirados((v) => !v)} className="flex w-full items-center justify-between py-2 text-left" aria-expanded={mostrarRetirados}>
                  <h2 className="text-sm font-semibold text-ink-3">Retirados do cofre · {retirados.length}</h2>
                  <span className="text-ink-3" aria-hidden="true">
                    {mostrarRetirados ? "▴" : "▾"}
                  </span>
                </button>
                {mostrarRetirados && (
                  <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface opacity-70">
                    {retirados.map((p) => (
                      <ItemPagamento key={p.id} p={p} diaVencimento={null} />
                    ))}
                  </ul>
                )}
              </section>
            )}

            {ativos.length > 0 && <p className="mb-2 text-center text-[11px] text-ink-3">Toque num pagamento para ver o comprovante, editar ou retirar.</p>}
          </>
        )}
      </main>

      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-4 pt-3">
        <Link
          href="/pensao/novo"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-accent/25 active:bg-accent-strong"
        >
          <span className="text-xl leading-none" aria-hidden="true">
            ＋
          </span>
          Registrar pagamento
        </Link>
      </div>
    </div>
  );
}

function Tile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-surface px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{rotulo}</div>
      <div className="tnum mt-0.5 text-lg font-semibold">{valor}</div>
    </div>
  );
}

function ItemPagamento({ p, diaVencimento }: { p: PagamentoAtual; diaVencimento: number | null }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!p.comprovante) return;
    let url: string | null = null;
    let ativo = true;
    obterBlob(p.comprovante.blobKey).then((b) => {
      if (!ativo || !b || !b.type.startsWith("image/")) return;
      url = URL.createObjectURL(b);
      setThumb(url);
    });
    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [p.comprovante]);

  const atraso = diaVencimento !== null && !p.retirada ? diasAposVencimento(p, diaVencimento) : 0;
  const titulo = [nomeForma(p.forma), p.observacao].filter(Boolean).join(" · ") || "Pagamento";

  return (
    <li>
      <Link href={`/pagamento/${p.linhagem}`} className="flex items-center gap-3 px-3 py-3 active:bg-rule/40">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : p.comprovante ? (
            <span className="text-[10px] font-medium text-ink-3">PDF</span>
          ) : (
            <span className="text-center text-[10px] font-medium leading-tight text-risk">sem comprovante</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{titulo}</span>
            {p.historico > 1 && <span className="shrink-0 text-[10px] text-ink-3">v{p.versao}</span>}
          </div>
          <div className="truncate text-xs text-ink-3">
            recebido em {formatData(p.data_do_fato)}
            {atraso > 0 ? ` · ${atraso} ${atraso === 1 ? "dia" : "dias"} após o vencimento` : ""}
          </div>
        </div>
        <div className={["tnum shrink-0 text-sm font-semibold", p.retirada ? "line-through text-ink-3" : ""].join(" ")}>{formatBRL(p.valor_centavos)}</div>
        <span className="text-ink-3" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}

function EntradaIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <rect x="4" y="17" width="16" height="4" rx="1.5" />
    </svg>
  );
}
