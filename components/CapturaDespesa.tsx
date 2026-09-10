"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORIAS } from "@/lib/categorias";
import type { CategoriaId, Leitura } from "@/lib/types";
import { criarDespesa, criarDespesasEmLote } from "@/lib/store";
import { sha256Hex } from "@/lib/hash";
import { reduzirParaLeitura } from "@/lib/imagem";
import { formatBRL, formatBytes, formatData, hojeISO, parseBRL } from "@/lib/format";
import { PERCENTUAIS_RAPIDOS, formatPercentual, parteDoFilho } from "@/lib/rateio";
import RateioPainel from "./RateioPainel";
import SeletorFilho from "./SeletorFilho";
import { listarFilhos } from "@/lib/filhos";
import type { FilhoAtual } from "@/lib/types";

type Estado = "editando" | "salvando" | "erro";
type LeituraEstado = "ocioso" | "lendo" | "ok" | "nao_comprovante" | "falhou" | "indisponivel";
type Modo = "unico" | "lista";

interface ItemLido {
  descricao: string | null;
  valor_centavos: number | null;
  data: string | null;
  categoria: CategoriaId | null;
  confianca: number;
}

interface RespostaLeitura {
  e_comprovante: boolean;
  tipo: Modo;
  itens: ItemLido[];
  resumo: string | null;
  modelo: string;
}

/** um lançamento da lista, já com os valores que a pessoa pode ajustar */
interface ItemSel {
  chave: string;
  descricao: string;
  valor_centavos: number;
  data: string;
  categoria: CategoriaId;
  /** parte do filho, 0–100. 100 = lançamento inteiro */
  percentual: number;
  marcado: boolean;
  lido: ItemLido;
}

/** parte do filho de um item da lista, em centavos */
function parteItem(i: ItemSel): number {
  return i.percentual >= 100 ? i.valor_centavos : parteDoFilho(i.valor_centavos, i.percentual);
}

function centavosParaTexto(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",");
}

export default function CapturaDespesa() {
  const router = useRouter();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  // modo único
  const [valorTexto, setValorTexto] = useState("");
  const [data, setData] = useState(hojeISO());
  const [categoria, setCategoria] = useState<CategoriaId | null>(null);
  const [mostrarObs, setMostrarObs] = useState(false);
  const [observacao, setObservacao] = useState("");
  // rateio (modo único): o campo Valor passa a ser o TOTAL do comprovante
  const [rateioAtivo, setRateioAtivo] = useState(false);
  const [rateioPct, setRateioPct] = useState(50);
  const [rateioCriterio, setRateioCriterio] = useState("");

  // leitura automática
  const [leituraEstado, setLeituraEstado] = useState<LeituraEstado>("ocioso");
  const [leitura, setLeitura] = useState<RespostaLeitura | null>(null);
  const [valorEditado, setValorEditado] = useState(false);
  const [dataEditada, setDataEditada] = useState(false);
  const [categoriaEditada, setCategoriaEditada] = useState(false);

  // modo lista
  const [modo, setModo] = useState<Modo>("unico");
  const [itens, setItens] = useState<ItemSel[]>([]);
  const [ignoradosSemValor, setIgnoradosSemValor] = useState(0);

  const [estado, setEstado] = useState<Estado>("editando");
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  // filhos: 1 → atribui sozinho; 2+ → a pessoa escolhe (ou "todos"); 0 → sem filho
  const [filhos, setFilhos] = useState<FilhoAtual[]>([]);
  const [filho, setFilho] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    listarFilhos()
      .then((fs) => {
        setFilhos(fs);
        setFilho(fs.length === 1 ? fs[0].linhagem : fs.length === 0 ? null : undefined);
      })
      .catch(() => setFilho(null));
  }, []);
  const filhoOk = filhos.length < 2 || filho !== undefined;

  const valorCentavos = useMemo(() => parseBRL(valorTexto), [valorTexto]);
  /** o que vai para o cofre no modo único: parte do filho (ou o valor inteiro) */
  const parteUnico = useMemo(
    () => (valorCentavos === null ? null : rateioAtivo ? parteDoFilho(valorCentavos, rateioPct) : valorCentavos),
    [valorCentavos, rateioAtivo, rateioPct],
  );
  const marcados = useMemo(() => itens.filter((i) => i.marcado), [itens]);
  const totalMarcado = useMemo(() => marcados.reduce((s, i) => s + parteItem(i), 0), [marcados]);

  const podeSalvar =
    estado !== "salvando" &&
    filhoOk &&
    (modo === "lista" ? marcados.length > 0 : parteUnico !== null && parteUnico > 0 && categoria !== null);

  const itemUnico = leitura?.tipo === "unico" ? leitura.itens[0] : undefined;
  const valorVeioDaLeitura = itemUnico?.valor_centavos != null && !valorEditado && valorTexto !== "";
  const categoriaVeioDaLeitura = itemUnico?.categoria != null && !categoriaEditada && categoria === itemUnico.categoria;

  function limparFormulario() {
    setValorTexto("");
    setData(hojeISO());
    setCategoria(null);
    setObservacao("");
    setMostrarObs(false);
    setValorEditado(false);
    setDataEditada(false);
    setCategoriaEditada(false);
    setRateioAtivo(false);
    setRateioPct(50);
    setRateioCriterio("");
    setModo("unico");
    setItens([]);
    setIgnoradosSemValor(0);
  }

  // preview + hash + leitura automática do arquivo escolhido
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

    // 1) selo: hash dos bytes originais, no aparelho
    arquivo
      .arrayBuffer()
      .then(sha256Hex)
      .then((h) => {
        if (!cancelado) setHash(h);
      })
      .catch(() => {
        if (!cancelado) setHash(null);
      });

    // 2) leitura: cópia reduzida vai ao servidor; a resposta só SUGERE
    setLeitura(null);
    setLeituraEstado("lendo");
    (async () => {
      try {
        const reduzida = await reduzirParaLeitura(arquivo);
        if (!reduzida) {
          if (!cancelado) setLeituraEstado("indisponivel"); // PDF ou não-imagem: manual
          return;
        }
        const r = await fetch("/api/ler-comprovante", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(reduzida),
        });
        if (cancelado) return;
        if (r.status === 503) {
          setLeituraEstado("indisponivel");
          return;
        }
        if (!r.ok) {
          setLeituraEstado("falhou");
          return;
        }
        const res = (await r.json()) as RespostaLeitura;
        if (cancelado) return;
        setLeitura(res);
        if (!res.e_comprovante || res.itens.length === 0) {
          setLeituraEstado("nao_comprovante");
          return;
        }

        if (res.tipo === "lista") {
          const hoje = hojeISO();
          const comValor = res.itens.filter((i) => i.valor_centavos != null);
          setIgnoradosSemValor(res.itens.length - comValor.length);
          setItens(
            comValor.map((i, idx) => ({
              chave: `${idx}-${i.valor_centavos}-${i.descricao ?? ""}`,
              descricao: i.descricao ?? "Lançamento",
              valor_centavos: i.valor_centavos as number,
              data: i.data ?? hoje,
              categoria: i.categoria ?? "outro",
              percentual: 100,
              marcado: false, // decisão consciente por item — nunca pré-marcado
              lido: i,
            })),
          );
          setModo("lista");
          setLeituraEstado("ok");
          return;
        }

        // único: preenche só o que a pessoa ainda não tocou
        const i = res.itens[0];
        setModo("unico");
        setValorTexto((atual) => (atual === "" && i.valor_centavos ? centavosParaTexto(i.valor_centavos) : atual));
        if (i.data) setData((atual) => (atual === hojeISO() ? (i.data as string) : atual));
        setCategoria((atual) => atual ?? i.categoria);
        setObservacao((atual) => atual || i.descricao || "");
        setLeituraEstado("ok");
      } catch {
        if (!cancelado) setLeituraEstado("falhou");
      }
    })();

    return () => {
      cancelado = true;
      URL.revokeObjectURL(url);
    };
  }, [arquivo]);

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      limparFormulario();
      setArquivo(f);
    }
    e.target.value = "";
  }

  function trocarArquivo() {
    setArquivo(null);
    limparFormulario();
  }

  function alternarItem(chave: string) {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, marcado: !i.marcado } : i)));
  }
  function marcarTodos(valor: boolean) {
    setItens((lista) => lista.map((i) => ({ ...i, marcado: valor })));
  }
  function mudarCategoriaItem(chave: string, cat: CategoriaId) {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, categoria: cat } : i)));
  }
  function mudarPercentualItem(chave: string, pct: number) {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, percentual: pct } : i)));
  }

  function registroLeitura(lido: ItemLido, confirmadoSemAlteracao: boolean): Leitura | undefined {
    if (!leitura) return undefined;
    return {
      modelo: leitura.modelo,
      lido_em: new Date().toISOString(),
      valor_centavos: lido.valor_centavos ?? undefined,
      data: lido.data ?? undefined,
      estabelecimento: lido.descricao ?? undefined,
      categoria: lido.categoria ?? undefined,
      confianca: lido.confianca,
      confirmado_sem_alteracao: confirmadoSemAlteracao,
    };
  }

  async function salvar() {
    if (!podeSalvar) return;
    setEstado("salvando");
    setMensagemErro(null);
    try {
      if (modo === "lista") {
        await criarDespesasEmLote(
          marcados.map((i) => ({
            filho: filho ?? undefined,
            valor_centavos: parteItem(i),
            rateio: i.percentual < 100 ? { total_centavos: i.valor_centavos, percentual: i.percentual } : undefined,
            data_do_fato: i.data,
            categoria: i.categoria,
            observacao: i.descricao,
            leitura: registroLeitura(i.lido, i.categoria === i.lido.categoria),
          })),
          arquivo,
        );
        router.push(`/?salvo=${marcados.length}`);
        return;
      }
      if (valorCentavos === null || parteUnico === null || categoria === null) return;
      await criarDespesa({
        filho: filho ?? undefined,
        valor_centavos: parteUnico,
        rateio: rateioAtivo
          ? { total_centavos: valorCentavos, percentual: rateioPct, criterio: rateioCriterio.trim() || undefined }
          : undefined,
        data_do_fato: data,
        categoria,
        observacao: observacao || undefined,
        arquivo,
        leitura: itemUnico ? registroLeitura(itemUnico, !valorEditado && !dataEditada && !categoriaEditada) : undefined,
      });
      router.push("/?salvo=1");
    } catch (err) {
      setEstado("erro");
      setMensagemErro(
        err instanceof Error && /indexeddb|quota|storage/i.test(err.message)
          ? "Não consegui guardar no aparelho. Se você está em modo anônimo ou sem espaço, tente no navegador normal."
          : "Não consegui guardar. Tente de novo em alguns segundos.",
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-t sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-paper/95 px-4 pb-3 backdrop-blur">
        <Link href="/" className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-ink-2 active:bg-rule/50" aria-label="Voltar">
          ← Voltar
        </Link>
        <h1 className="text-base font-semibold">{modo === "lista" ? "Despesas do print" : "Nova despesa"}</h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="flex-1 space-y-6 px-4 pb-36 pt-4">
        {/* 1 · Comprovante */}
        <section aria-labelledby="lbl-foto">
          <div className="mb-2 flex items-baseline justify-between">
            <label id="lbl-foto" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
              Comprovante
            </label>
            {arquivo && (
              <button type="button" onClick={trocarArquivo} className="text-xs font-medium text-accent">
                Trocar
              </button>
            )}
          </div>

          {!arquivo ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/60 text-accent active:bg-accent-soft"
              >
                <CameraIcon />
                <span className="text-sm font-semibold">Tirar foto do comprovante</span>
              </button>
              <button
                type="button"
                onClick={() => galeriaRef.current?.click()}
                className="flex h-36 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-rule bg-surface text-ink-3 active:bg-rule/40"
                aria-label="Escolher da galeria"
              >
                <GaleriaIcon />
                <span className="text-[11px] font-medium leading-tight">Galeria ou print</span>
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Comprovante selecionado"
                  className={[modo === "lista" ? "max-h-40" : "max-h-64", "w-full bg-zinc-100 object-contain"].join(" ")}
                />
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
              <LinhaLeitura estado={leituraEstado} leitura={leitura} />
            </div>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={aoEscolherArquivo} />
          <input ref={galeriaRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={aoEscolherArquivo} />
          {!arquivo && (
            <p className="mt-2 text-xs text-ink-3">
              Foto de nota ou recibo, ou print de Pix, cartão e boleto. O app lê valor, data e categoria para você conferir.
            </p>
          )}
        </section>

        {filhos.length >= 2 && <SeletorFilho filhos={filhos} valor={filho} onChange={setFilho} rotulo={modo === "lista" ? "De quem são estes lançamentos?" : "De quem é?"} />}

        {modo === "lista" ? (
          /* ===== MODO LISTA: um registro por lançamento marcado ===== */
          <section aria-labelledby="lbl-itens">
            <div className="mb-2 flex items-baseline justify-between">
              <label id="lbl-itens" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                {itens.length} lançamentos — marque os do seu filho
              </label>
              <div className="flex gap-3 text-xs font-medium text-accent">
                <button type="button" onClick={() => marcarTodos(true)}>
                  Marcar todos
                </button>
                {marcados.length > 0 && (
                  <button type="button" onClick={() => marcarTodos(false)}>
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-surface">
              {itens.map((i) => (
                <li key={i.chave} className={i.marcado ? "bg-accent-soft/40" : ""}>
                  <button
                    type="button"
                    onClick={() => alternarItem(i.chave)}
                    aria-pressed={i.marcado}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left"
                  >
                    <span
                      className={[
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-white",
                        i.marcado ? "border-accent bg-accent" : "border-rule bg-surface",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {i.marcado && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.descricao}</span>
                      <span className="block text-xs text-ink-3">
                        {formatData(i.data)}
                        {!i.lido.data && <span className="text-risk"> · data não lida, usando hoje</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-sm font-semibold">{formatBRL(i.valor_centavos)}</span>
                      {i.marcado && i.percentual < 100 && (
                        <span className="tnum block text-[11px] text-accent">filho: {formatBRL(parteItem(i))}</span>
                      )}
                    </span>
                  </button>
                  {i.marcado && (
                    <div className="grid grid-cols-[1fr_auto] gap-2 px-3 pb-3 pl-12">
                      <select
                        id={`cat-${i.chave}`}
                        aria-label="Categoria"
                        value={i.categoria}
                        onChange={(e) => mudarCategoriaItem(i.chave, e.target.value as CategoriaId)}
                        className="h-9 min-w-0 rounded-lg border border-rule bg-surface px-2 text-sm outline-none focus:border-accent"
                      >
                        {CATEGORIAS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                            {i.lido.categoria === c.id ? " (sugerida)" : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        id={`pct-${i.chave}`}
                        aria-label="Parte do filho"
                        value={i.percentual}
                        onChange={(e) => mudarPercentualItem(i.chave, Number(e.target.value))}
                        className={[
                          "h-9 rounded-lg border bg-surface px-2 text-sm outline-none focus:border-accent",
                          i.percentual < 100 ? "border-accent text-accent" : "border-rule",
                        ].join(" ")}
                      >
                        <option value={100}>tudo do filho</option>
                        {PERCENTUAIS_RAPIDOS.map((p) => (
                          <option key={p.valor} value={p.valor}>
                            {formatPercentual(p.valor)} · {p.dica}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {ignoradosSemValor > 0 && (
              <p className="mt-2 text-xs text-ink-3">
                {ignoradosSemValor} {ignoradosSemValor === 1 ? "linha ficou de fora" : "linhas ficaram de fora"} por não ter valor legível.
              </p>
            )}

            <p className="mt-3 text-xs text-ink-3">
              Cada lançamento marcado vira um registro próprio, todos com este print como comprovante. O que não for do seu filho, não
              marque. Se só uma parte for dele (restaurante, mercado), escolha a fração — o total fica gravado junto.
            </p>

            <button
              type="button"
              onClick={() => {
                setModo("unico");
                setItens([]);
              }}
              className="mt-3 text-sm font-medium text-accent"
            >
              Registrar como uma despesa só
            </button>
          </section>
        ) : (
          /* ===== MODO ÚNICO ===== */
          <>
            {/* 2 · Valor */}
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <label htmlFor="valor" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  {rateioAtivo ? "Total do comprovante" : "Valor"}
                </label>
                {valorVeioDaLeitura && <span className="text-[11px] font-medium text-ok">lido do comprovante — confira</span>}
              </div>
              <div
                className={[
                  "flex items-center gap-2 rounded-2xl border bg-surface px-4 focus-within:border-accent",
                  valorVeioDaLeitura ? "border-ok/50" : "border-rule",
                ].join(" ")}
              >
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
              {valorTexto && valorCentavos === null && <p className="mt-1 text-xs text-risk">Digite um valor, por exemplo 89,90</p>}
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

            {/* 3 · Data */}
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <label htmlFor="data" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Data da despesa
                </label>
                {itemUnico?.data && !dataEditada && data === itemUnico.data && (
                  <span className="text-[11px] font-medium text-ok">lida do comprovante</span>
                )}
              </div>
              <input
                id="data"
                type="date"
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  setDataEditada(true);
                }}
                className="tnum h-12 w-full rounded-2xl border border-rule bg-surface px-4 text-base outline-none focus:border-accent"
              />
            </section>

            {/* 4 · Categoria */}
            <section aria-labelledby="lbl-cat">
              <div className="mb-2 flex items-baseline justify-between">
                <label id="lbl-cat" className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                  Categoria
                </label>
                {categoriaVeioDaLeitura && <span className="text-[11px] font-medium text-ok">sugerida — toque em outra se preferir</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIAS.map((c) => {
                  const ativa = categoria === c.id;
                  const sugerida = itemUnico?.categoria === c.id && !categoriaEditada;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCategoria(c.id);
                        setCategoriaEditada(c.id !== itemUnico?.categoria);
                      }}
                      aria-pressed={ativa}
                      className={[
                        "relative flex min-h-[52px] items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-colors",
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
                      {sugerida && ativa && (
                        <span className="absolute right-2 top-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                          sugerida
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 5 · Observação (opcional, recolhida) */}
            <section>
              {!mostrarObs ? (
                <button type="button" onClick={() => setMostrarObs(true)} className="max-w-full truncate text-left text-sm font-medium text-accent">
                  {observacao ? (
                    <>
                      <span className="text-ink-3">Observação:</span> {observacao} <span className="text-ink-3">✎</span>
                    </>
                  ) : (
                    "＋ Adicionar observação"
                  )}
                </button>
              ) : (
                <>
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
                </>
              )}
            </section>
          </>
        )}

        {mensagemErro && (
          <p role="alert" className="rounded-2xl border border-risk/30 bg-risk-soft px-4 py-3 text-sm text-risk">
            {mensagemErro}
          </p>
        )}
      </main>

      {/* Botão fixo no alcance do polegar */}
      <div className="safe-b fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-rule bg-paper/95 px-4 pt-3 backdrop-blur">
        <button
          type="button"
          onClick={salvar}
          disabled={!podeSalvar}
          className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-sm transition-colors disabled:bg-rule disabled:text-ink-3 active:bg-accent-strong"
        >
          {!filhoOk && estado !== "salvando"
            ? "Escolha de quem é a despesa"
            : estado === "salvando"
            ? "Guardando…"
            : modo === "lista"
              ? marcados.length === 0
                ? "Marque os lançamentos do seu filho"
                : `Guardar ${marcados.length} ${marcados.length === 1 ? "despesa" : "despesas"} · ${formatBRL(totalMarcado)}`
              : rateioAtivo && parteUnico
                ? `Guardar ${formatBRL(parteUnico)} no cofre`
                : "Guardar no cofre"}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-3">
          Fica registrado com data e hora. Nada é apagado — edições criam uma nova versão.
        </p>
      </div>
    </div>
  );
}

function LinhaLeitura({ estado, leitura }: { estado: LeituraEstado; leitura: RespostaLeitura | null }) {
  if (estado === "ocioso" || estado === "indisponivel") return null;

  const base = "flex items-center gap-2 border-t border-rule px-3 py-2 text-[12px]";

  if (estado === "lendo") {
    return (
      <div className={`${base} text-ink-3`}>
        <span className="h-3 w-3 animate-pulse rounded-full bg-accent/60" aria-hidden="true" />
        Lendo o comprovante…
      </div>
    );
  }
  if (estado === "falhou") {
    return <div className={`${base} text-ink-3`}>Não consegui ler automaticamente — preencha abaixo.</div>;
  }
  if (estado === "nao_comprovante") {
    return <div className={`${base} text-risk`}>Isso não parece um comprovante de despesa. Confira a foto.</div>;
  }
  if (leitura?.tipo === "lista") {
    return (
      <div className={`${base} text-ok`}>
        <span aria-hidden="true">✓</span>
        <span className="truncate">
          Li {leitura.itens.length} lançamentos{leitura.resumo ? ` · ${leitura.resumo}` : ""}
        </span>
      </div>
    );
  }
  const i = leitura?.itens[0];
  const partes: string[] = [];
  if (i?.valor_centavos) partes.push(formatBRL(i.valor_centavos));
  if (i?.data) partes.push(formatData(i.data));
  if (i?.descricao) partes.push(i.descricao);
  return (
    <div className={`${base} text-ok`}>
      <span aria-hidden="true">✓</span>
      <span className="truncate">Lido: {partes.join(" · ") || "confira os campos"}</span>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function GaleriaIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </svg>
  );
}
