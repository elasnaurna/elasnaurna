"use client";

// Valor combinado da pensão: definir, alterar (nova versão), retirar. O
// histórico mostra cada valor que já valeu e desde quando.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { definirCombinado, listarLogCombinado, retirarCombinado } from "@/lib/pagamentos";
import { combinadoAtual, descreverCombinado, mesAtual, valorDoCombinado } from "@/lib/pensao";
import { salarioMinimoEm } from "@/lib/salario-minimo";
import { formatBRL, formatDataHora, nomeMes, parseBRL } from "@/lib/format";
import type { Combinado } from "@/lib/types";

export default function CombinadoTela() {
  const router = useRouter();
  const [log, setLog] = useState<Combinado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"ver" | "editar" | "retirar">("ver");
  const [salvando, setSalvando] = useState(false);

  const [base, setBase] = useState<"reais" | "sm">("reais");
  const [valorTexto, setValorTexto] = useState("");
  const [pctTexto, setPctTexto] = useState("");
  const [dia, setDia] = useState("10");
  const [desde, setDesde] = useState(mesAtual());
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");

  const atual = useMemo(() => (log ? combinadoAtual(log) : null), [log]);
  // a última versão, mesmo retirada — para a linhagem continuar
  const ultima = useMemo(() => (log && log.length ? log[log.length - 1] : null), [log]);

  useEffect(() => {
    listarLogCombinado()
      .then((l) => {
        setLog(l);
        const c = combinadoAtual(l);
        if (!c) setModo("editar");
      })
      .catch(() => setErro("Não consegui abrir o cofre neste navegador."));
  }, []);

  function abrirEdicao() {
    if (atual) {
      setBase(atual.modo === "sm" ? "sm" : "reais");
      setValorTexto((atual.valor_centavos / 100).toFixed(2).replace(".", ","));
      setPctTexto(atual.percentual_sm ? String(atual.percentual_sm).replace(".", ",") : "");
      setDia(String(atual.dia_vencimento));
      setDesde(atual.vigente_desde);
      setObservacao(atual.observacao ?? "");
    }
    setMotivo("");
    setErro(null);
    setModo("editar");
  }

  const valorReais = useMemo(() => parseBRL(valorTexto), [valorTexto]);
  // em % do mínimo aceita acima de 100 (um salário e meio = 150)
  const pct = useMemo(() => {
    const n = Number(pctTexto.replace(",", ".").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
  }, [pctTexto]);
  const smHoje = salarioMinimoEm(mesAtual());
  const valorSmHoje = pct !== null && smHoje ? Math.round((smHoje.valor_centavos * pct) / 100) : null;
  const valor = base === "sm" ? valorSmHoje : valorReais;
  const diaNum = Number(dia);
  const diaOk = Number.isInteger(diaNum) && diaNum >= 1 && diaNum <= 31;
  const desdeOk = /^\d{4}-\d{2}$/.test(desde);
  const podeGuardar = !salvando && valor !== null && valor > 0 && diaOk && desdeOk && (base === "reais" || pct !== null);

  async function guardar() {
    if (!podeGuardar || valor === null) return;
    setSalvando(true);
    setErro(null);
    try {
      await definirCombinado(
        { modo: base, percentual_sm: base === "sm" ? (pct ?? undefined) : undefined, valor_centavos: valor, dia_vencimento: diaNum, vigente_desde: desde, observacao },
        ultima,
        motivo,
      );
      router.push("/pensao");
    } catch {
      setErro("Não consegui guardar. Tente de novo.");
      setSalvando(false);
    }
  }

  async function retirar() {
    if (!atual || !motivo.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await retirarCombinado(atual, motivo);
      router.push("/pensao");
    } catch {
      setErro("Não consegui retirar. Tente de novo.");
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/pensao" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">Valor combinado</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-40 pt-4">
        {log === null && !erro && <p className="py-10 text-center text-sm text-ink-3">Abrindo…</p>}

        {log !== null && modo === "ver" && atual && (
          <section className="rounded-2xl border border-rule bg-surface px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Vale hoje</p>
            <p className="tnum mt-1 text-3xl font-semibold">{formatBRL(valorDoCombinado(atual, mesAtual()).valor)}</p>
            <p className="mt-1 text-sm text-ink-2">
              {atual.modo === "sm" && atual.percentual_sm ? `${descreverCombinado(atual, formatBRL)} · ` : ""}
              vence dia {atual.dia_vencimento} · desde {nomeMes(atual.vigente_desde).toLowerCase()}
            </p>
            {atual.modo === "sm" && valorDoCombinado(atual, mesAtual()).sm && (
              <p className="mt-1 text-xs text-ink-3">
                Salário mínimo de {formatBRL(valorDoCombinado(atual, mesAtual()).sm!.salario_centavos)} ({valorDoCombinado(atual, mesAtual()).sm!.norma}). Quando o
                mínimo mudar, o valor de cada mês acompanha sozinho.
              </p>
            )}
            {atual.observacao && <p className="mt-1 text-sm text-ink-2">{atual.observacao}</p>}
          </section>
        )}

        {log !== null && modo === "editar" && (
          <>
            <section className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm text-ink-2">
              O valor que ficou combinado entre vocês ou fixado pelo juiz. Com ele, cada mês da aba Pensão mostra o que era devido, o que
              entrou e o que faltou. Se o valor mudar (acordo novo, revisional), registre aqui de novo: o anterior fica no histórico.
            </section>
            <section aria-labelledby="lbl-modo">
              <span id="lbl-modo" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Como foi fixado
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["reais", "sm"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBase(m)}
                    aria-pressed={base === m}
                    className={["h-11 rounded-xl border px-3 text-sm font-semibold", base === m ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink"].join(" ")}
                  >
                    {m === "reais" ? "Valor em reais" : "% do salário mínimo"}
                  </button>
                ))}
              </div>
            </section>
            {base === "reais" ? (
              <section>
                <label htmlFor="valor" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Valor mensal
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-rule bg-surface px-4 focus-within:border-accent">
                  <span className="text-lg font-medium text-ink-3">R$</span>
                  <input
                    id="valor"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={valorTexto}
                    onChange={(e) => setValorTexto(e.target.value)}
                    className="tnum h-14 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-ink-3/50"
                  />
                </div>
              </section>
            ) : (
              <section>
                <label htmlFor="pct" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Percentual do salário mínimo
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-rule bg-surface px-4 focus-within:border-accent">
                  <input
                    id="pct"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="30"
                    value={pctTexto}
                    onChange={(e) => setPctTexto(e.target.value)}
                    className="tnum h-14 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-ink-3/50"
                  />
                  <span className="text-lg font-medium text-ink-3">%</span>
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  {valorSmHoje !== null && smHoje
                    ? `Hoje: ${formatBRL(valorSmHoje)} (${pctTexto.trim()}% de ${formatBRL(smHoje.valor_centavos)}, ${smHoje.norma}). Em cada mês o app usa o mínimo vigente naquele mês.`
                    : "Ex.: 30 para 30% · 150 para um salário e meio. O app calcula o valor de cada mês com o mínimo vigente."}
                </p>
              </section>
            )}
            <div className="grid grid-cols-2 gap-3">
              <section>
                <label htmlFor="dia" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Vence dia
                </label>
                <input
                  id="dia"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                  className="tnum h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
                />
              </section>
              <section>
                <label htmlFor="desde" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Vale desde
                </label>
                <input
                  id="desde"
                  type="month"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="tnum h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
                />
              </section>
            </div>
            <section>
              <label htmlFor="obs" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                De onde vem esse valor <span className="font-normal normal-case">(opcional)</span>
              </label>
              <input
                id="obs"
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: acordo homologado em 03/2025 · sentença · combinado por mensagem"
                className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
              />
            </section>
            {atual && (
              <section>
                <label htmlFor="motivo" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Por que está alterando? <span className="font-normal normal-case">(opcional, fica no histórico)</span>
                </label>
                <input
                  id="motivo"
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: revisional julgada em 08/2026"
                  className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
                />
              </section>
            )}
          </>
        )}

        {log !== null && modo === "retirar" && atual && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm text-ink-2">
              Retirar quer dizer que <strong>não há mais valor combinado</strong> a partir de agora. Os meses deixam de mostrar o que era
              devido. Nada é apagado: o histórico continua, com o motivo.
            </div>
            <label htmlFor="motivo-ret" className="block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Motivo <span className="font-normal normal-case">(obrigatório)</span>
            </label>
            <textarea
              id="motivo-ret"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: registrei por engano · o acordo foi desfeito"
              className="w-full rounded-2xl border border-rule bg-surface px-4 py-3 text-base outline-none focus:border-accent"
            />
          </section>
        )}

        {log !== null && log.length > 0 && modo === "ver" && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Histórico · {log.length} {log.length === 1 ? "versão" : "versões"}</h2>
            <ol className="space-y-2">
              {[...log].reverse().map((c) => (
                <li key={c.id} className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      v{c.versao} · {c.retirada ? "retirado" : `${descreverCombinado(c, formatBRL)} · dia ${c.dia_vencimento} · desde ${nomeMes(c.vigente_desde).toLowerCase()}`}
                    </span>
                    <span className="tnum shrink-0 text-xs text-ink-3">{formatDataHora(c.criado_em)}</span>
                  </div>
                  {c.observacao && !c.retirada && <p className="mt-0.5 text-ink-2">{c.observacao}</p>}
                  {c.motivo && <p className="mt-0.5 text-xs text-ink-3">Motivo: {c.motivo}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {erro && (
          <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {erro}
          </p>
        )}
      </main>

      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        {modo === "ver" && atual && (
          <>
            <button type="button" onClick={abrirEdicao} className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm active:bg-accent-strong">
              Alterar valor combinado
            </button>
            <button
              type="button"
              onClick={() => {
                setMotivo("");
                setModo("retirar");
              }}
              className="mt-2 block w-full py-1 text-center text-sm font-medium text-risk"
            >
              Não há mais valor combinado
            </button>
          </>
        )}
        {modo === "editar" && (
          <>
            <button
              type="button"
              onClick={guardar}
              disabled={!podeGuardar}
              className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
            >
              {salvando ? "Guardando…" : atual ? "Guardar nova versão" : "Guardar valor combinado"}
            </button>
            {atual ? (
              <button type="button" onClick={() => setModo("ver")} className="mt-2 block w-full py-1 text-center text-sm font-medium text-ink-2">
                Cancelar
              </button>
            ) : (
              <p className="mt-2 text-center text-[11px] text-ink-3">Fica registrado com data e hora. Mudanças criam uma nova versão.</p>
            )}
          </>
        )}
        {modo === "retirar" && (
          <>
            <button
              type="button"
              onClick={retirar}
              disabled={salvando || !motivo.trim()}
              className="h-14 w-full rounded-2xl bg-risk text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3"
            >
              {salvando ? "Retirando…" : motivo.trim() ? "Retirar valor combinado" : "Escreva o motivo para retirar"}
            </button>
            <button type="button" onClick={() => setModo("ver")} className="mt-2 block w-full py-1 text-center text-sm font-medium text-ink-2">
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
