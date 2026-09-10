"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { categoria as infoCategoria } from "@/lib/categorias";
import { listarAtuais, obterBlob } from "@/lib/store";
import type { DespesaAtual } from "@/lib/types";
import { chaveMes, formatBRL, formatData, nomeMes } from "@/lib/format";
import { formatPercentual } from "@/lib/rateio";
import { idade, listarFilhosComRetirados } from "@/lib/filhos";
import type { FilhoAtual } from "@/lib/types";
import CabecalhoCofre from "./CabecalhoCofre";

export default function ListaDespesas() {
  const params = useSearchParams();
  const salvos = Number(params.get("salvo") ?? 0) || 0;

  const [itens, setItens] = useState<DespesaAtual[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarAviso, setMostrarAviso] = useState(salvos > 0);
  const [filhos, setFilhos] = useState<FilhoAtual[]>([]);
  /** filtro: null = todos os filhos; linhagem = só um; "sem" = sem filho definido */
  const [filtro, setFiltro] = useState<string | null>(null);

  useEffect(() => {
    const carregar = () =>
      Promise.all([listarAtuais(), listarFilhosComRetirados()])
        .then(([ds, fs]) => {
          setItens(ds);
          setFilhos(fs);
        })
        .catch(() => setErro("Não consegui abrir o cofre neste navegador. Tente fora do modo anônimo."));
    carregar();
    // quando a sincronização traz registros de outro aparelho, recarrega
    window.addEventListener("cofre:sincronizou", carregar);
    return () => window.removeEventListener("cofre:sincronizou", carregar);
  }, []);

  useEffect(() => {
    if (!mostrarAviso) return;
    const t = setTimeout(() => setMostrarAviso(false), 2500);
    return () => clearTimeout(t);
  }, [mostrarAviso]);

  const filhosAtivos = useMemo(() => filhos.filter((f) => !f.retirada), [filhos]);
  const nomes = useMemo(() => new Map(filhos.map((f) => [f.linhagem, f.nome])), [filhos]);
  const variosFilhos = filhosAtivos.length > 1;
  const passaFiltro = (d: DespesaAtual) => filtro === null || (filtro === "sem" ? !d.filho : d.filho === filtro);

  // Ativas contam; retiradas ficam visíveis à parte, nunca somem.
  const ativas = useMemo(() => (itens ?? []).filter((d) => !d.retirada && passaFiltro(d)), [itens, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const retiradas = useMemo(() => (itens ?? []).filter((d) => d.retirada && passaFiltro(d)), [itens, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mostrarRetiradas, setMostrarRetiradas] = useState(false);

  const porMes = useMemo(() => {
    const grupos = new Map<string, DespesaAtual[]>();
    for (const d of ativas) {
      const k = chaveMes(d.data_do_fato);
      grupos.set(k, [...(grupos.get(k) ?? []), d]);
    }
    return Array.from(grupos.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [ativas]);

  const totalGeral = useMemo(() => ativas.reduce((s, d) => s + d.valor_centavos, 0), [ativas]);
  const comComprovante = useMemo(() => ativas.filter((d) => d.comprovante).length, [ativas]);

  return (
    <div className="flex min-h-screen flex-col">
      <CabecalhoCofre aba="despesas" />

      {mostrarAviso && (
        <div role="status" className="mx-4 mt-3 rounded-2xl border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">
          {salvos > 1 ? `${salvos} despesas guardadas no cofre, com data e hora.` : "Guardado no cofre, com data e hora."}
        </div>
      )}

      <main className="flex-1 px-4 pb-32 pt-4">
        {erro && <p className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">{erro}</p>}

        {itens === null && !erro && <p className="py-10 text-center text-sm text-ink-3">Abrindo o cofre…</p>}

        {itens && itens.length === 0 && (
          <div className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <CofreIcon />
            </div>
            <h2 className="text-lg font-semibold">Seu cofre está vazio</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-ink-2">
              Cada despesa do seu filho, com o comprovante, guardada no dia em que acontece. Quando alguém pedir, está tudo aqui.
            </p>
            {filhosAtivos.length === 0 && (
              <Link href="/filhos/novo" className="mt-5 inline-block text-sm font-medium text-accent">
                Comece cadastrando seu filho (só o nome basta)
              </Link>
            )}
          </div>
        )}

        {itens && itens.length > 0 && (
          <>
            {variosFilhos ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip ativo={filtro === null} onClick={() => setFiltro(null)}>
                  Todos
                </Chip>
                {filhosAtivos.map((f) => (
                  <Chip key={f.linhagem} ativo={filtro === f.linhagem} onClick={() => setFiltro(f.linhagem)}>
                    {f.nome}
                  </Chip>
                ))}
                {(itens ?? []).some((d) => !d.filho) && (
                  <Chip ativo={filtro === "sem"} onClick={() => setFiltro("sem")}>
                    sem filho definido
                  </Chip>
                )}
                <Link href="/filhos" className="ml-auto text-xs font-medium text-accent">
                  filhos ›
                </Link>
              </div>
            ) : (
              // Um filho só: a linha inteira abre o perfil dele (editar, tamanhos, histórico).
              // Nenhum: convite para cadastrar.
              <Link
                href={filhosAtivos.length === 1 ? `/filhos/${filhosAtivos[0].linhagem}` : "/filhos/novo"}
                className="mb-3 flex items-center justify-between rounded-xl border border-rule bg-surface px-3 py-2 text-xs active:bg-rule/40"
              >
                <span className={filhosAtivos.length === 1 ? "font-semibold text-ink" : "text-ink-3"}>
                  {filhosAtivos.length === 1 ? `${filhosAtivos[0].nome}${idade(filhosAtivos[0].nascimento) ? ` · ${idade(filhosAtivos[0].nascimento)}` : ""}` : "Nenhum filho cadastrado"}
                </span>
                <span className="font-medium text-accent">{filhosAtivos.length === 1 ? "ver perfil ›" : "＋ cadastrar filho"}</span>
              </Link>
            )}

            <div className="mb-5 grid grid-cols-2 gap-2">
              <Tile rotulo={filtro && filtro !== "sem" ? `Total · ${nomes.get(filtro) ?? ""}` : "Total registrado"} valor={formatBRL(totalGeral)} />
              <Tile rotulo="Com comprovante" valor={`${comComprovante} de ${ativas.length}`} />
            </div>

            {ativas.length === 0 && (
              <p className="mb-6 rounded-2xl border border-rule bg-surface px-4 py-4 text-center text-sm text-ink-3">
                Nenhuma despesa ativa. As retiradas estão logo abaixo.
              </p>
            )}

            {porMes.map(([mes, lista]) => {
              const total = lista.reduce((s, d) => s + d.valor_centavos, 0);
              return (
                <section key={mes} className="mb-6">
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-ink-2">{nomeMes(mes)}</h2>
                    <span className="tnum text-sm font-medium">{formatBRL(total)}</span>
                  </div>
                  <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
                    {lista.map((d) => (
                      <ItemDespesa key={d.id} d={d} nomeFilho={variosFilhos && filtro === null ? (d.filho ? nomes.get(d.filho) ?? "?" : "todos") : undefined} />
                    ))}
                  </ul>
                </section>
              );
            })}

            {retiradas.length > 0 && (
              <section className="mb-6">
                <button
                  type="button"
                  onClick={() => setMostrarRetiradas((v) => !v)}
                  className="flex w-full items-center justify-between py-2 text-left"
                  aria-expanded={mostrarRetiradas}
                >
                  <h2 className="text-sm font-semibold text-ink-3">
                    Retiradas do cofre · {retiradas.length}
                  </h2>
                  <span className="text-ink-3" aria-hidden="true">
                    {mostrarRetiradas ? "▴" : "▾"}
                  </span>
                </button>
                {mostrarRetiradas && (
                  <>
                    <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface opacity-70">
                      {retiradas.map((d) => (
                        <ItemDespesa key={d.id} d={d} nomeFilho={variosFilhos && filtro === null ? (d.filho ? nomes.get(d.filho) ?? "?" : "todos") : undefined} />
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-ink-3">
                      Não contam nos totais. Continuam no histórico, com o motivo. Toque para ver ou devolver ao cofre.
                    </p>
                  </>
                )}
              </section>
            )}

            <p className="mb-2 text-center text-[11px] text-ink-3">Toque numa despesa para ver o comprovante, editar ou retirar.</p>
          </>
        )}
      </main>

      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-4 pt-3">
        <Link
          href="/nova"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-accent/25 active:bg-accent-strong"
        >
          <span className="text-xl leading-none" aria-hidden="true">
            ＋
          </span>
          Registrar despesa
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

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={["h-8 rounded-full border px-3 text-xs font-semibold", ativo ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink-2"].join(" ")}
    >
      {children}
    </button>
  );
}

function ItemDespesa({ d, nomeFilho }: { d: DespesaAtual; nomeFilho?: string }) {
  const cat = infoCategoria(d.categoria);
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!d.comprovante) return;
    let url: string | null = null;
    let ativo = true;
    obterBlob(d.comprovante.blobKey).then((b) => {
      if (!ativo || !b || !b.type.startsWith("image/")) return;
      url = URL.createObjectURL(b);
      setThumb(url);
    });
    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [d.comprovante]);

  return (
    <li>
      <Link href={`/despesa/${d.linhagem}`} className="flex items-center gap-3 px-3 py-3 active:bg-rule/40">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : d.comprovante ? (
            <span className="text-[10px] font-medium text-ink-3">PDF</span>
          ) : (
            <span className="text-center text-[10px] font-medium leading-tight text-risk">sem comprovante</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={["h-2 w-2 shrink-0 rounded-full", cat.dot].join(" ")} aria-hidden="true" />
            <span className="truncate text-sm font-medium">{cat.nome}</span>
            {nomeFilho && <span className="shrink-0 rounded bg-rule/70 px-1 text-[10px] font-semibold text-ink-2">{nomeFilho}</span>}
            {d.rateio && (
              <span className="shrink-0 rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent" title="parte do filho">
                {formatPercentual(d.rateio.percentual)}
              </span>
            )}
            {d.historico > 1 && <span className="shrink-0 text-[10px] text-ink-3">v{d.versao}</span>}
          </div>
          <div className="truncate text-xs text-ink-3">
            {formatData(d.data_do_fato)}
            {d.observacao ? ` · ${d.observacao}` : ""}
          </div>
        </div>
        <div className={["tnum shrink-0 text-sm font-semibold", d.retirada ? "line-through text-ink-3" : ""].join(" ")}>
          {formatBRL(d.valor_centavos)}
        </div>
        <span className="text-ink-3" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}

function CofreIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.5" />
    </svg>
  );
}
