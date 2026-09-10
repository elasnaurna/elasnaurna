"use client";

// Cadastrar ou editar um filho. Sem `linhagem` = novo. Editar cria versão
// nova; "retirar" tira da lista (ex.: cadastro duplicado), sem apagar.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarFilho, devolverFilho, idade, novaVersaoFilho, obterLinhagemFilho, retirarFilho } from "@/lib/filhos";
import { formatDataHora, formatDataLonga } from "@/lib/format";
import type { Filho } from "@/lib/types";

export default function FilhoTela({ linhagem }: { linhagem?: string }) {
  const router = useRouter();
  const novo = !linhagem;

  const [versoes, setVersoes] = useState<Filho[] | null>(novo ? [] : null);
  const atual = versoes && versoes.length > 0 ? versoes[versoes.length - 1] : null;
  const [modo, setModo] = useState<"ver" | "editar" | "retirar">(novo ? "editar" : "ver");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [roupa, setRoupa] = useState("");
  const [calcado, setCalcado] = useState("");
  const [escola, setEscola] = useState("");
  const [observacao, setObservacao] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!linhagem) return;
    obterLinhagemFilho(linhagem)
      .then(setVersoes)
      .catch(() => setErro("Não consegui abrir este cadastro neste navegador."));
  }, [linhagem]);

  function abrirEdicao() {
    if (atual) {
      setNome(atual.nome);
      setNascimento(atual.nascimento ?? "");
      setRoupa(atual.roupa ?? "");
      setCalcado(atual.calcado ?? "");
      setEscola(atual.escola ?? "");
      setObservacao(atual.observacao ?? "");
    }
    setMotivo("");
    setErro(null);
    setModo("editar");
  }

  const mudou = useMemo(() => {
    if (!atual) return true;
    const t = (v: string) => v.trim() || undefined;
    return (
      nome.trim() !== atual.nome ||
      t(nascimento) !== atual.nascimento ||
      t(roupa) !== atual.roupa ||
      t(calcado) !== atual.calcado ||
      t(escola) !== atual.escola ||
      t(observacao) !== atual.observacao
    );
  }, [atual, nome, nascimento, roupa, calcado, escola, observacao]);
  const podeGuardar = !salvando && nome.trim().length > 0 && mudou;

  async function guardar() {
    if (!podeGuardar) return;
    setSalvando(true);
    setErro(null);
    try {
      const input = { nome, nascimento, roupa, calcado, escola, observacao };
      if (atual) {
        await novaVersaoFilho(atual, input, motivo);
        setVersoes(await obterLinhagemFilho(atual.linhagem));
        setModo("ver");
        setSalvando(false);
      } else {
        await criarFilho(input);
        router.push("/filhos");
      }
    } catch {
      setErro("Não consegui guardar. Tente de novo.");
      setSalvando(false);
    }
  }

  async function retirar() {
    if (!atual || !motivo.trim()) return;
    setSalvando(true);
    try {
      await retirarFilho(atual, motivo);
      router.push("/filhos");
    } catch {
      setErro("Não consegui retirar. Tente de novo.");
      setSalvando(false);
    }
  }

  async function devolver() {
    if (!atual) return;
    setSalvando(true);
    try {
      await devolverFilho(atual);
      setVersoes(await obterLinhagemFilho(atual.linhagem));
    } catch {
      setErro("Não consegui devolver. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  const titulo = novo ? "Novo filho" : modo === "editar" ? "Editar cadastro" : atual?.nome ?? "Filho";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        {modo === "ver" || novo ? (
          <Link href="/filhos" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
            ← Voltar
          </Link>
        ) : (
          <button type="button" onClick={() => setModo("ver")} className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50">
            Cancelar
          </button>
        )}
        <h1 className="truncate text-base font-semibold">{titulo}</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-5 px-4 pb-40 pt-4">
        {!novo && versoes === null && !erro && <p className="py-10 text-center text-sm text-ink-3">Abrindo…</p>}
        {!novo && versoes !== null && !atual && <p className="py-10 text-center text-sm text-ink-3">Este cadastro não está neste aparelho.</p>}

        {atual?.retirada && modo === "ver" && (
          <div className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            <p className="font-semibold">Retirado em {formatDataHora(atual.criado_em)}</p>
            {atual.motivo && <p className="mt-0.5">Motivo: {atual.motivo}</p>}
            <p className="mt-1 text-xs opacity-80">As despesas que apontam para este filho continuam mostrando o nome.</p>
          </div>
        )}

        {modo === "ver" && atual && (
          <>
            <section className="rounded-2xl border border-rule bg-surface">
              <dl className="divide-y divide-rule text-sm">
                <Linha rotulo="Nome">{atual.nome}</Linha>
                {atual.nascimento && (
                  <Linha rotulo="Nascimento">
                    {formatDataLonga(atual.nascimento)} · {idade(atual.nascimento)}
                  </Linha>
                )}
                {atual.roupa && <Linha rotulo="Roupa">{atual.roupa}</Linha>}
                {atual.calcado && <Linha rotulo="Calçado">{atual.calcado}</Linha>}
                {atual.escola && <Linha rotulo="Escola">{atual.escola}</Linha>}
                {atual.observacao && <Linha rotulo="Observação">{atual.observacao}</Linha>}
                <Linha rotulo="Cadastrado em">{formatDataHora(versoes![0].criado_em)}</Linha>
              </dl>
            </section>
            {versoes!.length > 1 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Histórico · {versoes!.length} versões</h2>
                <ol className="space-y-2">
                  {[...versoes!].reverse().map((v) => (
                    <li key={v.id} className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">
                          v{v.versao} · {v.retirada ? "retirado" : [v.nome, v.roupa && `roupa ${v.roupa}`, v.calcado && `calçado ${v.calcado}`].filter(Boolean).join(" · ")}
                        </span>
                        <span className="tnum shrink-0 text-xs text-ink-3">{formatDataHora(v.criado_em)}</span>
                      </div>
                      {v.motivo && <p className="mt-0.5 text-xs text-ink-3">Motivo: {v.motivo}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}

        {modo === "editar" && (
          <>
            <Campo id="nome" rotulo="Nome (ou como você chama)" valor={nome} onChange={setNome} placeholder="Ex.: Sofia" autoFocus />
            <section>
              <label htmlFor="nasc" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Data de nascimento <span className="font-normal normal-case">(opcional — mostra a idade)</span>
              </label>
              <input id="nasc" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} className="tnum h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent" />
            </section>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="roupa" rotulo="Roupa" valor={roupa} onChange={setRoupa} placeholder="Ex.: 8" opcional />
              <Campo id="calcado" rotulo="Calçado" valor={calcado} onChange={setCalcado} placeholder="Ex.: 32" opcional />
            </div>
            <Campo id="escola" rotulo="Escola" valor={escola} onChange={setEscola} placeholder="Ex.: EMEI Monteiro Lobato" opcional />
            <section>
              <label htmlFor="obs" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Observações <span className="font-normal normal-case">(opcional)</span>
              </label>
              <textarea id="obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: natação às terças" className="w-full rounded-2xl border border-rule bg-surface px-4 py-3 text-base outline-none focus:border-accent" />
              <p className="mt-1 text-[11px] text-ink-3">Nada de saúde aqui (alergias, remédios, laudos): o app não guarda isso de propósito.</p>
            </section>
            {atual && (
              <Campo id="motivo" rotulo="Por que está alterando?" valor={motivo} onChange={setMotivo} placeholder="Ex.: trocou de escola" opcional />
            )}
          </>
        )}

        {modo === "retirar" && atual && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-rule bg-surface px-4 py-3 text-sm text-ink-2">
              Retirar tira {atual.nome} da lista e dos filtros, mas <strong>não apaga</strong> nada: as despesas continuam mostrando o nome, e dá para devolver depois.
            </div>
            <label htmlFor="motivo-ret" className="block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Motivo <span className="font-normal normal-case">(obrigatório)</span>
            </label>
            <textarea id="motivo-ret" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cadastrei duas vezes" className="w-full rounded-2xl border border-rule bg-surface px-4 py-3 text-base outline-none focus:border-accent" />
          </section>
        )}

        {erro && (
          <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {erro}
          </p>
        )}
      </main>

      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        {modo === "ver" && atual && !atual.retirada && (
          <>
            <button type="button" onClick={abrirEdicao} className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm active:bg-accent-strong">
              Editar cadastro
            </button>
            <button
              type="button"
              onClick={() => {
                setMotivo("");
                setModo("retirar");
              }}
              className="mt-2 block w-full py-1 text-center text-sm font-medium text-risk"
            >
              Retirar da lista
            </button>
          </>
        )}
        {modo === "ver" && atual?.retirada && (
          <button type="button" onClick={devolver} disabled={salvando} className="h-14 w-full rounded-2xl border border-accent bg-surface text-base font-semibold text-accent disabled:opacity-60 active:bg-accent-soft">
            {salvando ? "Devolvendo…" : "Devolver à lista"}
          </button>
        )}
        {modo === "editar" && (
          <>
            <button type="button" onClick={guardar} disabled={!podeGuardar} className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong">
              {salvando ? "Guardando…" : novo ? "Cadastrar" : mudou ? "Guardar nova versão" : "Nada foi alterado"}
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-3">{novo ? "Depois dá para editar; cada mudança fica no histórico." : "A versão anterior continua no histórico."}</p>
          </>
        )}
        {modo === "retirar" && (
          <button type="button" onClick={retirar} disabled={salvando || !motivo.trim()} className="h-14 w-full rounded-2xl bg-risk text-base font-semibold text-white shadow-sm disabled:bg-rule disabled:text-ink-3">
            {salvando ? "Retirando…" : motivo.trim() ? "Retirar da lista" : "Escreva o motivo para retirar"}
          </button>
        )}
      </div>
    </div>
  );
}

function Campo({ id, rotulo, valor, onChange, placeholder, opcional, autoFocus }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; placeholder?: string; opcional?: boolean; autoFocus?: boolean }) {
  return (
    <section>
      <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
        {rotulo} {opcional && <span className="font-normal normal-case">(opcional)</span>}
      </label>
      <input
        id={id}
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
      />
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-ink-3">{rotulo}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}
