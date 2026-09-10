"use client";

// Atrasados atualizados — memória de cálculo. Só aparece o que a pessoa
// registrou (combinado e pagamentos); índice e juros são escolha de quem
// calcula, e ficam escritos no topo. Nada aqui diz "devido": diz "em aberto".

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listarLogCombinado, listarPagamentosAtuais } from "@/lib/pagamentos";
import { mesesPensao } from "@/lib/pensao";
import { obterIndices } from "@/lib/indices-cache";
import { INDICES_EMBUTIDOS, type Indices, type NomeIndice } from "@/lib/indices";
import { calcularAtrasados, descreverParametros, PARAMETROS_PADRAO, type Atrasados as Calculo } from "@/lib/atrasados";
import { formatBRL, formatData, hojeISO, nomeMes } from "@/lib/format";
import type { Combinado, PagamentoAtual } from "@/lib/types";

export default function AtrasadosTela() {
  const [pagamentos, setPagamentos] = useState<PagamentoAtual[] | null>(null);
  const [logCombinado, setLogCombinado] = useState<Combinado[]>([]);
  const [indices, setIndices] = useState<Indices>(INDICES_EMBUTIDOS);
  const [erro, setErro] = useState<string | null>(null);

  const [indice, setIndice] = useState<NomeIndice | "nenhum">(PARAMETROS_PADRAO.indice);
  const [jurosMes, setJurosMes] = useState<number>(PARAMETROS_PADRAO.jurosMes);
  const [dataCalculo, setDataCalculo] = useState(hojeISO());

  useEffect(() => {
    Promise.all([listarPagamentosAtuais(), listarLogCombinado()])
      .then(([p, c]) => {
        setPagamentos(p);
        setLogCombinado(c);
      })
      .catch(() => setErro("Não consegui abrir o cofre neste navegador."));
    obterIndices().then(setIndices);
  }, []);

  const calculo: Calculo | null = useMemo(() => {
    if (!pagamentos) return null;
    const meses = mesesPensao(pagamentos, logCombinado, dataCalculo.slice(0, 7));
    return calcularAtrasados(meses, indices, { indice, jurosMes, dataCalculo });
  }, [pagamentos, logCombinado, indices, indice, jurosMes, dataCalculo]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/pensao" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">Atrasados</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-5 px-4 pb-10 pt-4">
        {erro && <p className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">{erro}</p>}
        {!calculo && !erro && <p className="py-10 text-center text-sm text-ink-3">Calculando…</p>}

        {calculo && (
          <>
            <section className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">Índice</span>
                <select value={indice} onChange={(e) => setIndice(e.target.value as NomeIndice | "nenhum")} className="h-11 w-full rounded-xl border border-rule bg-surface px-2 text-sm outline-none focus:border-accent">
                  <option value="INPC">INPC</option>
                  <option value="IPCA">IPCA</option>
                  <option value="nenhum">Nenhum</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">Juros</span>
                <select value={jurosMes} onChange={(e) => setJurosMes(Number(e.target.value))} className="h-11 w-full rounded-xl border border-rule bg-surface px-2 text-sm outline-none focus:border-accent">
                  <option value={1}>1% ao mês</option>
                  <option value={0.5}>0,5% ao mês</option>
                  <option value={0}>Nenhum</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">Data</span>
                <input type="date" value={dataCalculo} onChange={(e) => e.target.value && setDataCalculo(e.target.value)} className="tnum h-11 w-full rounded-xl border border-rule bg-surface px-2 text-sm outline-none focus:border-accent" />
              </label>
            </section>

            {calculo.parcelas.length === 0 ? (
              <p className="rounded-2xl border border-rule bg-surface px-4 py-6 text-center text-sm text-ink-3">
                {logCombinado.length === 0
                  ? "Sem valor combinado não há como saber o que ficou em aberto. Defina o valor na aba Pensão."
                  : "Nenhuma parcela vencida em aberto até esta data."}
              </p>
            ) : (
              <>
                <section className="rounded-2xl border border-rule bg-surface px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Em aberto, atualizado</p>
                  <p className="tnum mt-1 text-3xl font-semibold">{formatBRL(calculo.total)}</p>
                  <p className="tnum mt-1 text-sm text-ink-2">
                    {formatBRL(calculo.totalAberto)} original · {formatBRL(calculo.totalCorrigido - calculo.totalAberto)} de correção · {formatBRL(calculo.totalJuros)} de juros
                  </p>
                  <p className="mt-2 text-[11px] text-ink-3">
                    {descreverParametros(calculo.parametros)}, para {formatData(calculo.parametros.dataCalculo)}.
                    {calculo.indiceAte && ` ${calculo.parametros.indice} disponível até ${nomeMes(calculo.indiceAte).toLowerCase()}.`}
                    {indices.atualizadoEm ? " Série do IBGE." : " Série embutida no app (sem rede)."}
                  </p>
                  {calculo.mesesSemIndice.length > 0 && (
                    <p className="mt-1 text-[11px] text-risk">
                      Sem índice para {calculo.mesesSemIndice.map((m) => nomeMes(m).toLowerCase()).join(", ")} — entrou como zero; refaça quando o IBGE divulgar.
                    </p>
                  )}
                </section>

                <section className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-rule bg-surface px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">3 últimas vencidas</div>
                    <div className="tnum mt-0.5 text-lg font-semibold">{formatBRL(calculo.tresMaisRecentes.total)}</div>
                    <div className="text-[11px] text-ink-3">{calculo.tresMaisRecentes.meses.length ? calculo.tresMaisRecentes.meses.map((m) => nomeMes(m).slice(0, 3).toLowerCase()).join(", ") : "nada em aberto"}</div>
                  </div>
                  <div className="rounded-2xl border border-rule bg-surface px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Anteriores</div>
                    <div className="tnum mt-0.5 text-lg font-semibold">{formatBRL(calculo.anteriores.total)}</div>
                    <div className="text-[11px] text-ink-3">{calculo.anteriores.meses.length} {calculo.anteriores.meses.length === 1 ? "parcela" : "parcelas"}</div>
                  </div>
                </section>
                <p className="text-[11px] text-ink-3">
                  O art. 528, § 7º, do CPC separa as 3 prestações vencidas mais recentes (e as que vencerem no processo) das anteriores — cada grupo segue um
                  caminho de cobrança. Qual usar é decisão do advogado.
                </p>

                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Memória de cálculo</h2>
                  <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
                    {[...calculo.parcelas].reverse().map((p) => (
                      <li key={p.mes} className="px-4 py-3 text-sm">
                        <div className="flex items-baseline justify-between">
                          <span className="font-semibold">{nomeMes(p.mes)}</span>
                          <span className="tnum font-semibold">{formatBRL(p.total)}</span>
                        </div>
                        <div className="tnum mt-0.5 text-xs text-ink-2">
                          combinado {formatBRL(p.devido)} · recebido {formatBRL(p.recebido)} · em aberto {formatBRL(p.aberto)}
                        </div>
                        <div className="tnum mt-0.5 text-[11px] text-ink-3">
                          venceu {formatData(p.vencimento)} · fator {p.fator.toFixed(6).replace(".", ",")} → {formatBRL(p.corrigido)} · {p.dias} dias · juros {formatBRL(p.juros)}
                          {p.semIndice.length > 0 && <span className="text-risk"> · sem índice: {p.semIndice.join(", ")}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <p className="text-[11px] text-ink-3">
                  Esta é uma conta aritmética sobre o que foi registrado, com o critério escolhido acima. Índice, juros e a data-base de cada
                  parcela quem define é a sentença ou o juízo; a memória completa vai na pasta exportada (atrasados.csv) para o advogado conferir.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
