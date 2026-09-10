"use client";

// Registrar um pagamento de pensão recebido: print do Pix/extrato → leitura
// automática (sugere valor, data, quem pagou) → conferir → mês de referência
// → forma → guardar. Mesmo fluxo da despesa, sem categoria e sem rateio.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FormaPagamento, Leitura } from "@/lib/types";
import { FORMAS, criarPagamento } from "@/lib/pagamentos";
import { sha256Hex } from "@/lib/hash";
import { reduzirParaLeitura } from "@/lib/imagem";
import { formatBRL, formatBytes, formatData, hojeISO, nomeMes, parseBRL } from "@/lib/format";
import { mesAnterior, proximoMes } from "@/lib/pensao";

type LeituraEstado = "ocioso" | "lendo" | "ok" | "nao_comprovante" | "falhou" | "indisponivel";

interface ItemLido {
  descricao: string | null;
  valor_centavos: number | null;
  data: string | null;
  confianca: number;
}
interface RespostaLeitura {
  e_comprovante: boolean;
  tipo: "unico" | "lista";
  itens: ItemLido[];
  resumo: string | null;
  modelo: string;
}

function centavosParaTexto(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",");
}

/** Meses que fazem sentido como referência para um pagamento nesta data: 3 antes, o próprio, 1 depois. */
function mesesDeReferencia(data: string): string[] {
  const m = data.slice(0, 7);
  const out = [mesAnterior(mesAnterior(mesAnterior(m))), mesAnterior(mesAnterior(m)), mesAnterior(m), m, proximoMes(m)];
  return out;
}

export default function CapturaPagamento() {
  const router = useRouter();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const [valorTexto, setValorTexto] = useState("");
  const [data, setData] = useState(hojeISO());
  const [referencia, setReferencia] = useState(hojeISO().slice(0, 7));
  const [referenciaEditada, setReferenciaEditada] = useState(false);
  const [forma, setForma] = useState<FormaPagamento | null>("pix");
  const [observacao, setObservacao] = useState("");

  const [leituraEstado, setLeituraEstado] = useState<LeituraEstado>("ocioso");
  const [leitura, setLeitura] = useState<RespostaLeitura | null>(null);
  const [itemEscolhido, setItemEscolhido] = useState<ItemLido | null>(null);
  const [valorEditado, setValorEditado] = useState(false);
  const [dataEditada, setDataEditada] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const valor = useMemo(() => parseBRL(valorTexto), [valorTexto]);
  const podeSalvar = !salvando && valor !== null && valor > 0 && !!data && /^\d{4}-\d{2}$/.test(referencia);
  const valorVeioDaLeitura = itemEscolhido?.valor_centavos != null && !valorEditado && valorTexto !== "";

  // a referência acompanha a data até a pessoa mexer nela
  useEffect(() => {
    if (!referenciaEditada) setReferencia(data.slice(0, 7));
  }, [data, referenciaEditada]);

  function aplicarItem(i: ItemLido) {
    setItemEscolhido(i);
    if (i.valor_centavos) {
      setValorTexto(centavosParaTexto(i.valor_centavos));
      setValorEditado(false);
    }
    if (i.data) {
      setData(i.data);
      setDataEditada(false);
    }
    if (i.descricao) setObservacao((o) => o || i.descricao || "");
  }

  function limpar() {
    setValorTexto("");
    setData(hojeISO());
    setReferencia(hojeISO().slice(0, 7));
    setReferenciaEditada(false);
    setForma("pix");
    setObservacao("");
    setItemEscolhido(null);
    setValorEditado(false);
    setDataEditada(false);
  }

  useEffect(() => {
    if (!arquivo) {
      setPreview(null);
      setHash(null);
      setLeitura(null);
      setLeituraEstado("ocioso");
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPreview(url);
    setHash(null);
    let cancelado = false;
    arquivo
      .arrayBuffer()
      .then(sha256Hex)
      .then((h) => {
        if (!cancelado) setHash(h);
      })
      .catch(() => {
        if (!cancelado) setHash(null);
      });

    setLeitura(null);
    setLeituraEstado("lendo");
    (async () => {
      try {
        const reduzida = await reduzirParaLeitura(arquivo);
        if (!reduzida) {
          if (!cancelado) setLeituraEstado("indisponivel");
          return;
        }
        const r = await fetch("/api/ler-comprovante", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(reduzida),
        });
        if (cancelado) return;
        if (r.status === 503) return setLeituraEstado("indisponivel");
        if (!r.ok) return setLeituraEstado("falhou");
        const res = (await r.json()) as RespostaLeitura;
        if (cancelado) return;
        setLeitura(res);
        if (!res.e_comprovante || res.itens.length === 0) return setLeituraEstado("nao_comprovante");
        // um lançamento só: já preenche. Vários: a pessoa escolhe qual é a pensão.
        if (res.tipo === "unico" || res.itens.length === 1) aplicarItem(res.itens[0]);
        setLeituraEstado("ok");
      } catch {
        if (!cancelado) setLeituraEstado("falhou");
      }
    })();

    return () => {
      cancelado = true;
      URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivo]);

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      limpar();
      setArquivo(f);
    }
    e.target.value = "";
  }

  function registroLeitura(): Leitura | undefined {
    if (!leitura || !itemEscolhido) return undefined;
    return {
      modelo: leitura.modelo,
      lido_em: new Date().toISOString(),
      valor_centavos: itemEscolhido.valor_centavos ?? undefined,
      data: itemEscolhido.data ?? undefined,
      estabelecimento: itemEscolhido.descricao ?? undefined,
      confianca: itemEscolhido.confianca,
      confirmado_sem_alteracao: !valorEditado && !dataEditada,
    };
  }

  async function guardar() {
    if (!podeSalvar || valor === null) return;
    setSalvando(true);
    setErro(null);
    try {
      await criarPagamento({
        valor_centavos: valor,
        data_do_fato: data,
        referencia,
        forma: forma ?? undefined,
        observacao: observacao || undefined,
        arquivo,
        leitura: registroLeitura(),
      });
      router.push("/pensao?salvo=1");
    } catch (e) {
      setSalvando(false);
      setErro(
        e instanceof Error && /indexeddb|quota|storage/i.test(e.message)
          ? "Não consegui guardar no aparelho. Se você está em modo anônimo ou sem espaço, tente no navegador normal."
          : "Não consegui guardar. Tente de novo em alguns segundos.",
      );
    }
  }

  const mesesRef = mesesDeReferencia(data);
  if (!mesesRef.includes(referencia)) mesesRef.push(referencia);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/pensao" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">Pagamento recebido</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-36 pt-4">
        <section aria-labelledby="lbl-comp">
          <div className="mb-2 flex items-baseline justify-between">
            <label id="lbl-comp" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Comprovante
            </label>
            {arquivo && (
              <button
                type="button"
                onClick={() => {
                  setArquivo(null);
                  limpar();
                }}
                className="text-xs font-medium text-accent"
              >
                Trocar
              </button>
            )}
          </div>
          {arquivo ? (
            <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Comprovante selecionado" className="max-h-56 w-full bg-zinc-100 object-contain" />
              )}
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-ink-3">
                <span className="truncate">
                  {arquivo.name || "foto"} · {formatBytes(arquivo.size)}
                </span>
                <span className="tnum shrink-0 font-mono">
                  {hash ? (
                    <span className="text-ok" title={`SHA-256 ${hash}`}>
                      selo {hash.slice(0, 10)}…
                    </span>
                  ) : (
                    <span>selando…</span>
                  )}
                </span>
              </div>
              <StatusLeitura estado={leituraEstado} leitura={leitura} item={itemEscolhido} />
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={() => galeriaRef.current?.click()}
                className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/60 text-accent active:bg-accent-soft"
              >
                <span className="text-sm font-semibold">Print do Pix, extrato ou recibo</span>
                <span className="text-[11px] opacity-80">galeria ou arquivo</span>
              </button>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex h-32 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-rule bg-surface text-ink-3 active:bg-rule/40"
                aria-label="Tirar foto"
              >
                <span className="text-[11px] font-medium leading-tight">Tirar foto</span>
              </button>
            </div>
          )}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherArquivo} />
          <input ref={galeriaRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={escolherArquivo} />
          {!arquivo && <p className="mt-2 text-xs text-ink-3">Dá para registrar sem comprovante — mas com o print, o registro vale muito mais.</p>}

          {leitura?.tipo === "lista" && leitura.itens.length > 1 && (
            <div className="mt-3 rounded-2xl border border-rule bg-surface">
              <p className="px-3 pt-3 text-xs font-semibold text-ink-2">Li {leitura.itens.length} lançamentos — toque no que é a pensão:</p>
              <ul className="mt-2 divide-y divide-rule">
                {leitura.itens.map((i, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => aplicarItem(i)}
                      aria-pressed={itemEscolhido === i}
                      className={["flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm", itemEscolhido === i ? "bg-accent-soft/50" : ""].join(" ")}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{i.descricao ?? "Lançamento"}</span>
                        {i.data && <span className="block text-xs text-ink-3">{formatData(i.data)}</span>}
                      </span>
                      <span className="tnum shrink-0 font-semibold">{i.valor_centavos ? formatBRL(i.valor_centavos) : "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="valor" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Valor recebido
            </label>
            {valorVeioDaLeitura && <span className="text-[11px] font-medium text-ok">lido do comprovante — confira</span>}
          </div>
          <div className={["flex items-center gap-2 rounded-2xl border bg-surface px-4 focus-within:border-accent", valorVeioDaLeitura ? "border-ok/50" : "border-rule"].join(" ")}>
            <span className="text-lg font-medium text-ink-3">R$</span>
            <input
              id="valor"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={leituraEstado === "lendo" ? "lendo…" : "0,00"}
              value={valorTexto}
              onChange={(e) => {
                setValorTexto(e.target.value);
                setValorEditado(true);
              }}
              className="tnum h-14 w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-ink-3/50"
            />
          </div>
          {valorTexto && valor === null && <p className="mt-1 text-xs text-risk">Digite um valor, por exemplo 1500,00</p>}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section>
            <label htmlFor="data" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Entrou em
            </label>
            <input
              id="data"
              type="date"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                setDataEditada(true);
              }}
              className="tnum h-12 w-full rounded-2xl border border-rule bg-surface px-3 text-base outline-none focus:border-accent"
            />
          </section>
          <section>
            <label htmlFor="ref" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-3">
              Pensão de
            </label>
            <select
              id="ref"
              value={referencia}
              onChange={(e) => {
                setReferencia(e.target.value);
                setReferenciaEditada(true);
              }}
              className="h-12 w-full rounded-2xl border border-rule bg-surface px-3 text-base outline-none focus:border-accent"
            >
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
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setForma(sel ? null : f.id)}
                  aria-pressed={sel}
                  className={["h-10 rounded-xl border px-3 text-sm font-semibold", sel ? "border-accent bg-accent text-white" : "border-rule bg-surface text-ink"].join(" ")}
                >
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
          <input
            id="obs"
            type="text"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: Pix de Fulano · pagou em duas partes"
            className="h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
          />
        </section>

        {erro && (
          <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {erro}
          </p>
        )}
      </main>

      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        <button
          type="button"
          onClick={guardar}
          disabled={!podeSalvar}
          className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm transition-colors disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
        >
          {salvando ? "Guardando…" : valor && valor > 0 ? `Guardar ${formatBRL(valor)} · pensão de ${nomeMes(referencia).toLowerCase()}` : "Guardar no cofre"}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-3">Fica registrado com data e hora. Nada é apagado — edições criam uma nova versão.</p>
      </div>
    </div>
  );
}

function StatusLeitura({ estado, leitura, item }: { estado: LeituraEstado; leitura: RespostaLeitura | null; item: ItemLido | null }) {
  if (estado === "ocioso" || estado === "indisponivel") return null;
  const base = "flex items-center gap-2 border-t border-rule px-3 py-2 text-[12px]";
  if (estado === "lendo")
    return (
      <div className={`${base} text-ink-3`}>
        <span className="h-3 w-3 animate-pulse rounded-full bg-accent/60" aria-hidden="true" />
        Lendo o comprovante…
      </div>
    );
  if (estado === "falhou") return <div className={`${base} text-ink-3`}>Não consegui ler automaticamente — preencha abaixo.</div>;
  if (estado === "nao_comprovante") return <div className={`${base} text-risk`}>Isso não parece um comprovante. Confira a imagem.</div>;
  if (leitura?.tipo === "lista" && leitura.itens.length > 1 && !item)
    return <div className={`${base} text-ok`}>✓ Li {leitura.itens.length} lançamentos — escolha abaixo qual é a pensão.</div>;
  const partes: string[] = [];
  if (item?.valor_centavos) partes.push(formatBRL(item.valor_centavos));
  if (item?.data) partes.push(formatData(item.data));
  if (item?.descricao) partes.push(item.descricao);
  return (
    <div className={`${base} text-ok`}>
      <span aria-hidden="true">✓</span>
      <span className="truncate">Lido: {partes.join(" · ") || "confira os campos"}</span>
    </div>
  );
}
