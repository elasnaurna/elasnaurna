"use client";

// Relatório imprimível: demonstrativo de despesas do período. Vira PDF pelo
// "Imprimir → Salvar como PDF" do navegador. Sem biblioteca, sem servidor.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listarLog } from "@/lib/store";
import { listarLogCombinado, listarLogPagamentos, nomeForma } from "@/lib/pagamentos";
import { listarLogFilhos, listarNomes, nomeDoFilho } from "@/lib/filhos";
import { CATEGORIAS, categoria as infoCategoria } from "@/lib/categorias";
import { formatBRL, formatData, formatDataHora, formatDataLonga, nomeMes } from "@/lib/format";
import { descreverRateio } from "@/lib/rateio";
import { atrasadosDaPasta, noPeriodo, pagamentoNoPeriodo, preparar, resumoMensal, type Periodo, type Preparado } from "@/lib/exportar";
import { descreverParametros } from "@/lib/atrasados";
import { obterIndices } from "@/lib/indices-cache";
import { INDICES_EMBUTIDOS, type Indices } from "@/lib/indices";
import { devidoNoMes, diasAposVencimento } from "@/lib/pensao";
import GraficoCustoPensao from "./GraficoCustoPensao";
import type { Despesa } from "@/lib/types";

export default function Relatorio() {
  const params = useSearchParams();
  const de = params.get("de");
  const ate = params.get("ate");
  const periodo: Periodo | null = de && ate ? { de, ate } : null;

  const [prep, setPrep] = useState<Preparado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [geradoEm] = useState(() => new Date().toISOString());
  const [indices, setIndices] = useState<Indices>(INDICES_EMBUTIDOS);

  useEffect(() => {
    Promise.all([listarLog(), listarLogPagamentos(), listarLogCombinado(), listarLogFilhos()])
      .then(([log, logPag, logComb, logFilhos]) => setPrep(preparar(log, logPag, logComb, logFilhos)))
      .catch(() => setErro("Não consegui abrir o cofre neste navegador."));
    obterIndices().then(setIndices);
  }, []);

  const ativas = useMemo(() => (prep ? prep.ativas.filter((d) => noPeriodo(d, periodo)) : []), [prep, periodo]);
  const retiradas = useMemo(() => (prep ? prep.retiradas.filter((d) => noPeriodo(d, periodo)) : []), [prep, periodo]);
  const pagamentos = useMemo(() => (prep ? prep.pagamentos.filter((p) => pagamentoNoPeriodo(p, periodo)) : []), [prep, periodo]);
  const total = ativas.reduce((s, d) => s + d.valor_centavos, 0);
  const comComprovante = ativas.filter((d) => d.comprovante).length;
  const totalPensao = pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
  const mensal = useMemo(() => (prep ? resumoMensal(ativas, pagamentos, prep.combinado, periodo) : []), [prep, ativas, pagamentos, periodo]);
  const temPensao = pagamentos.length > 0 || mensal.some((l) => l.combinado !== null);
  const serie = useMemo(() => mensal.map((l) => ({ mes: l.mes, custo: l.custo, recebido: l.recebido, devido: l.combinado })), [mensal]);
  const nadaNoPeriodo = ativas.length === 0 && pagamentos.length === 0;
  const atrasados = useMemo(() => (prep ? atrasadosDaPasta(prep, periodo, indices) : null), [prep, periodo, indices]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>();
    for (const d of ativas) {
      const k = d.categoria;
      const v = m.get(k) ?? { n: 0, total: 0 };
      v.n++;
      v.total += d.valor_centavos;
      m.set(k, v);
    }
    return CATEGORIAS.filter((c) => m.has(c.id)).map((c) => ({ cat: c, ...m.get(c.id)! }));
  }, [ativas]);

  const porMes = useMemo(() => {
    const m = new Map<string, Despesa[]>();
    for (const d of ativas) {
      const k = d.data_do_fato.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [ativas]);

  const tituloPeriodo = periodo
    ? periodo.de === periodo.ate
      ? nomeMes(periodo.de)
      : `${nomeMes(periodo.de)} a ${nomeMes(periodo.ate)}`
    : prep && prep.meses.length
      ? prep.meses.length === 1
        ? nomeMes(prep.meses[0])
        : `${nomeMes(prep.meses[0])} a ${nomeMes(prep.meses[prep.meses.length - 1])}`
      : "";

  return (
    <div className="min-h-screen bg-white text-ink">
      {/* barra de ações — não sai na impressão */}
      <div className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur print:hidden">
        <Link href="/exportar" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50">
          ← Exportar
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!prep || nadaNoPeriodo}
          className="h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
        >
          Imprimir / salvar PDF
        </button>
      </div>

      <article className="mx-auto max-w-3xl px-5 py-6 text-[13px] leading-relaxed print:max-w-none print:px-0 print:py-0">
        {erro && <p className="text-risk">{erro}</p>}
        {!prep && !erro && <p className="text-ink-3">Abrindo o cofre…</p>}

        {prep && (
          <>
            <header className="border-b-2 border-ink pb-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">AlimentaProva · demonstrativo de despesas{temPensao ? " e pensão" : ""}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Despesas {prep.filhos.length ? `de ${listarNomes(prep.filhos.map((f) => f.nome))}` : "do filho"}
                {temPensao ? " e pensão recebida" : ""} — {tituloPeriodo}
              </h1>
              <p className="mt-1 text-xs text-ink-2">
                Gerado em {formatDataHora(geradoEm)} · {ativas.length} {ativas.length === 1 ? "despesa" : "despesas"} · {comComprovante} com comprovante
                {retiradas.length > 0 ? ` · ${retiradas.length} ${retiradas.length === 1 ? "retirada" : "retiradas"} (não constam)` : ""}
                {pagamentos.length > 0 ? ` · ${pagamentos.length} ${pagamentos.length === 1 ? "pagamento de pensão" : "pagamentos de pensão"}` : ""}
              </p>
            </header>

            {nadaNoPeriodo ? (
              <p className="py-10 text-center text-ink-3">Nada registrado no período.</p>
            ) : (
              <>
                {temPensao && (
                  <section className="mt-5 break-inside-avoid">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Custo do filho × pensão, mês a mês</h2>
                    <div className="mx-auto max-w-xl">
                      <GraficoCustoPensao serie={serie} altura={170} />
                    </div>
                    <table className="mt-4 w-full border-collapse">
                      <thead>
                        <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-3">
                          <th className="py-1.5 pr-2 font-semibold">Mês</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Custo do filho</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Combinado</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Recebido</th>
                          <th className="py-1.5 text-right font-semibold">Custo − recebido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mensal.map((l) => (
                          <tr key={l.mes} className="border-b border-rule/70">
                            <td className="py-1.5 pr-2">{nomeMes(l.mes)}</td>
                            <td className="tnum py-1.5 pr-2 text-right">{formatBRL(l.custo)}</td>
                            <td className="tnum py-1.5 pr-2 text-right">{l.combinado === null ? <span className="text-ink-3">—</span> : formatBRL(l.combinado)}</td>
                            <td className="tnum py-1.5 pr-2 text-right">{formatBRL(l.recebido)}</td>
                            <td className="tnum py-1.5 text-right font-medium">{formatBRL(l.custo - l.recebido)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-ink font-semibold">
                          <td className="py-2 pr-2">Total</td>
                          <td className="tnum py-2 pr-2 text-right">{formatBRL(mensal.reduce((s, l) => s + l.custo, 0))}</td>
                          <td className="tnum py-2 pr-2 text-right">{mensal.some((l) => l.combinado !== null) ? formatBRL(mensal.reduce((s, l) => s + (l.combinado ?? 0), 0)) : "—"}</td>
                          <td className="tnum py-2 pr-2 text-right">{formatBRL(totalPensao)}</td>
                          <td className="tnum py-2 text-right">{formatBRL(mensal.reduce((s, l) => s + l.custo, 0) - totalPensao)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </section>
                )}

                {ativas.length > 0 && (<>
                {prep.filhos.length > 1 && (
                  <section className="mt-5 break-inside-avoid">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Resumo por filho</h2>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-3">
                          <th className="py-1.5 pr-2 font-semibold">Filho</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Despesas</th>
                          <th className="py-1.5 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...prep.filhos.map((f) => ({ nome: f.nome, ds: ativas.filter((d) => d.filho === f.linhagem) })), { nome: "De todos / da casa", ds: ativas.filter((d) => !d.filho) }]
                          .filter((l) => l.ds.length > 0)
                          .map((l) => (
                            <tr key={l.nome} className="border-b border-rule/70">
                              <td className="py-1.5 pr-2">{l.nome}</td>
                              <td className="tnum py-1.5 pr-2 text-right">{l.ds.length}</td>
                              <td className="tnum py-1.5 text-right">{formatBRL(l.ds.reduce((s, d) => s + d.valor_centavos, 0))}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </section>
                )}
                {/* Resumo por categoria */}
                <section className="mt-5 break-inside-avoid">
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Resumo por categoria</h2>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-3">
                        <th className="py-1.5 pr-2 font-semibold">Categoria</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">Despesas</th>
                        <th className="py-1.5 text-right font-semibold">Parte do filho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porCategoria.map(({ cat, n, total: t }) => (
                        <tr key={cat.id} className="border-b border-rule/70">
                          <td className="py-1.5 pr-2">
                            <span className="inline-flex items-center gap-2">
                              <span className={["h-2 w-2 rounded-full print:hidden", cat.dot].join(" ")} aria-hidden="true" />
                              {cat.nome}
                            </span>
                          </td>
                          <td className="tnum py-1.5 pr-2 text-right">{n}</td>
                          <td className="tnum py-1.5 text-right">{formatBRL(t)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-ink font-semibold">
                        <td className="py-2 pr-2">Total</td>
                        <td className="tnum py-2 pr-2 text-right">{ativas.length}</td>
                        <td className="tnum py-2 text-right">{formatBRL(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </section>

                {/* Detalhe por mês */}
                <section className="mt-7">
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Despesas, uma a uma</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse">
                      <thead>
                        <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-3">
                          <th className="py-1.5 pr-2 font-semibold">Data</th>
                          {prep.filhos.length > 1 && <th className="py-1.5 pr-2 font-semibold">Filho</th>}
                          <th className="py-1.5 pr-2 font-semibold">Categoria</th>
                          <th className="py-1.5 pr-2 font-semibold">Descrição</th>
                          <th className="py-1.5 pr-2 text-right font-semibold">Valor</th>
                          <th className="py-1.5 pr-2 font-semibold">Comprovante</th>
                          <th className="py-1.5 font-semibold">Registrada em</th>
                        </tr>
                      </thead>
                      {porMes.map(([mes, lista]) => {
                        const t = lista.reduce((s, d) => s + d.valor_centavos, 0);
                        return (
                          <tbody key={mes} className="break-inside-avoid">
                            <tr className="bg-paper print:bg-transparent">
                              <td colSpan={prep.filhos.length > 1 ? 4 : 3} className="py-1.5 pr-2 text-xs font-semibold">
                                {nomeMes(mes)}
                              </td>
                              <td className="tnum py-1.5 pr-2 text-right text-xs font-semibold">{formatBRL(t)}</td>
                              <td colSpan={2} />
                            </tr>
                            {lista.map((d) => (
                              <tr key={d.id} className="border-b border-rule/70 align-top">
                                <td className="tnum whitespace-nowrap py-1.5 pr-2">{formatDataLonga(d.data_do_fato).replace(/ de \d{4}$/, "")}</td>
                                {prep.filhos.length > 1 && <td className="py-1.5 pr-2">{nomeDoFilho(d.filho, prep.nomesFilhos, "todos")}</td>}
                                <td className="py-1.5 pr-2">{infoCategoria(d.categoria).nome}</td>
                                <td className="py-1.5 pr-2">
                                  {d.observacao || <span className="text-ink-3">—</span>}
                                  {d.rateio && <div className="text-[11px] text-ink-3">{descreverRateio(d.rateio, formatBRL)}</div>}
                                </td>
                                <td className="tnum whitespace-nowrap py-1.5 pr-2 text-right font-medium">{formatBRL(d.valor_centavos)}</td>
                                <td className="py-1.5 pr-2 font-mono text-[10px]">
                                  {d.comprovante ? (
                                    <span title={d.comprovante.sha256}>selo {d.comprovante.sha256.slice(0, 12)}</span>
                                  ) : (
                                    <span className="font-sans text-risk">sem comprovante</span>
                                  )}
                                </td>
                                <td className="tnum whitespace-nowrap py-1.5 text-[11px] text-ink-2">
                                  {formatDataHora(prep.primeiraEntrada.get(d.linhagem) ?? d.criado_em)}
                                  {(prep.versoes.get(d.linhagem) ?? 1) > 1 && (
                                    <span className="text-ink-3"> · v{prep.versoes.get(d.linhagem)}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        );
                      })}
                    </table>
                  </div>
                </section>
                </>)}

                {pagamentos.length > 0 && prep && (
                  <section className="mt-7 break-inside-avoid">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Pagamentos de pensão recebidos</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse">
                        <thead>
                          <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-3">
                            <th className="py-1.5 pr-2 font-semibold">Pensão de</th>
                            <th className="py-1.5 pr-2 font-semibold">Recebido em</th>
                            <th className="py-1.5 pr-2 font-semibold">Como / de quem</th>
                            <th className="py-1.5 pr-2 text-right font-semibold">Valor</th>
                            <th className="py-1.5 pr-2 font-semibold">Comprovante</th>
                            <th className="py-1.5 font-semibold">Registrado em</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagamentos.map((pg) => {
                            const dev = devidoNoMes(prep.combinado, pg.referencia);
                            const dias = dev ? diasAposVencimento(pg, dev.dia) : 0;
                            return (
                              <tr key={pg.id} className="border-b border-rule/70 align-top">
                                <td className="whitespace-nowrap py-1.5 pr-2">{nomeMes(pg.referencia)}</td>
                                <td className="tnum whitespace-nowrap py-1.5 pr-2">
                                  {formatData(pg.data_do_fato)}
                                  {dias > 0 && <div className="text-[11px] text-ink-3">{dias} {dias === 1 ? "dia" : "dias"} após o vencimento (dia {dev!.dia})</div>}
                                </td>
                                <td className="py-1.5 pr-2">{[nomeForma(pg.forma), pg.observacao].filter(Boolean).join(" · ") || <span className="text-ink-3">—</span>}</td>
                                <td className="tnum whitespace-nowrap py-1.5 pr-2 text-right font-medium">{formatBRL(pg.valor_centavos)}</td>
                                <td className="py-1.5 pr-2 font-mono text-[10px]">
                                  {pg.comprovante ? <span title={pg.comprovante.sha256}>selo {pg.comprovante.sha256.slice(0, 12)}</span> : <span className="font-sans text-risk">sem comprovante</span>}
                                </td>
                                <td className="tnum whitespace-nowrap py-1.5 text-[11px] text-ink-2">
                                  {formatDataHora(prep.primeiraEntrada.get(pg.linhagem) ?? pg.criado_em)}
                                  {(prep.versoes.get(pg.linhagem) ?? 1) > 1 && <span className="text-ink-3"> · v{prep.versoes.get(pg.linhagem)}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {atrasados && (
                  <section className="mt-7 break-inside-avoid">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Em aberto, atualizado — memória de cálculo</h2>
                    <p className="mb-2 text-[11px] text-ink-2">
                      {descreverParametros(atrasados.parametros)}; data do cálculo {formatData(atrasados.parametros.dataCalculo)}
                      {atrasados.indiceAte ? `; ${atrasados.parametros.indice} disponível até ${nomeMes(atrasados.indiceAte).toLowerCase()}` : ""}.
                      {atrasados.mesesSemIndice.length > 0 && ` Sem índice para ${atrasados.mesesSemIndice.map((m) => nomeMes(m).toLowerCase()).join(", ")} (entrou como zero).`}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse">
                        <thead>
                          <tr className="border-b border-rule text-left text-[11px] uppercase tracking-wide text-ink-3">
                            <th className="py-1.5 pr-2 font-semibold">Mês</th>
                            <th className="py-1.5 pr-2 font-semibold">Vencimento</th>
                            <th className="py-1.5 pr-2 text-right font-semibold">Combinado</th>
                            <th className="py-1.5 pr-2 text-right font-semibold">Recebido</th>
                            <th className="py-1.5 pr-2 text-right font-semibold">Em aberto</th>
                            <th className="py-1.5 pr-2 text-right font-semibold">Fator</th>
                            <th className="py-1.5 pr-2 text-right font-semibold">Corrigido</th>
                            <th className="py-1.5 pr-2 text-right font-semibold">Juros</th>
                            <th className="py-1.5 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {atrasados.parcelas.map((x) => (
                            <tr key={x.mes} className="border-b border-rule/70">
                              <td className="whitespace-nowrap py-1.5 pr-2">
                                {nomeMes(x.mes)}
                                {atrasados.tresMaisRecentes.meses.includes(x.mes) && <span className="ml-1 text-[10px] text-ink-3">§ 7º</span>}
                              </td>
                              <td className="tnum whitespace-nowrap py-1.5 pr-2">{formatData(x.vencimento)}</td>
                              <td className="tnum py-1.5 pr-2 text-right">{formatBRL(x.devido)}</td>
                              <td className="tnum py-1.5 pr-2 text-right">{formatBRL(x.recebido)}</td>
                              <td className="tnum py-1.5 pr-2 text-right">{formatBRL(x.aberto)}</td>
                              <td className="tnum py-1.5 pr-2 text-right">{x.fator.toFixed(6).replace(".", ",")}</td>
                              <td className="tnum py-1.5 pr-2 text-right">{formatBRL(x.corrigido)}</td>
                              <td className="tnum py-1.5 pr-2 text-right">{formatBRL(x.juros)}</td>
                              <td className="tnum py-1.5 text-right font-medium">{formatBRL(x.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-ink font-semibold">
                            <td className="py-2 pr-2" colSpan={4}>
                              Total
                            </td>
                            <td className="tnum py-2 pr-2 text-right">{formatBRL(atrasados.totalAberto)}</td>
                            <td />
                            <td className="tnum py-2 pr-2 text-right">{formatBRL(atrasados.totalCorrigido)}</td>
                            <td className="tnum py-2 pr-2 text-right">{formatBRL(atrasados.totalJuros)}</td>
                            <td className="tnum py-2 text-right">{formatBRL(atrasados.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="mt-2 text-[11px] text-ink-2">
                      “§ 7º” marca as 3 prestações vencidas mais recentes (art. 528, § 7º, CPC): em aberto nelas, {formatBRL(atrasados.tresMaisRecentes.total)}; nas
                      anteriores, {formatBRL(atrasados.anteriores.total)}. Conta aritmética sobre o registrado, com o critério acima; índice, juros e data-base são
                      definidos pela sentença ou pelo juízo.
                    </p>
                  </section>
                )}

                <footer className="mt-8 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-2">
                  <p>
                    <strong>Valor</strong> é a parte atribuída ao filho. Quando só uma fração do comprovante é dele, a linha traz o total do
                    comprovante, a fração e o critério declarados por quem registrou. <strong>Registrada em</strong> é quando a despesa entrou no
                    cofre — distinta da data da despesa; “vN” indica que o registro tem N versões (edições nunca apagam a anterior).{" "}
                    <strong>Selo</strong> é o SHA-256 dos bytes do arquivo original, calculado no aparelho no momento do registro; os arquivos
                    estão na pasta exportada, com o selo no nome.
                    {retiradas.length > 0 &&
                      ` ${retiradas.length} ${retiradas.length === 1 ? "despesa foi retirada" : "despesas foram retiradas"} do cofre pela própria parte, com data e motivo, e não ${retiradas.length === 1 ? "consta" : "constam"} deste demonstrativo.`}
                  </p>
                  {temPensao && (
                    <p className="mt-2">
                      <strong>Pensão</strong>: cada pagamento conta no mês a que a parte declarou que se refere (“pensão de”), não no mês em que entrou.{" "}
                      <strong>Combinado</strong> é o valor mensal registrado pela parte como acordado ou fixado, com o dia de vencimento; “custo − recebido” é
                      aritmética entre o registrado e o recebido, sem juízo sobre o que seria devido.
                    </p>
                  )}
                  <p className="mt-2">Este documento organiza registros feitos pela própria parte. Não é parecer jurídico.</p>
                </footer>
              </>
            )}
          </>
        )}
      </article>
    </div>
  );
}
