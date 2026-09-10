// Exportação: o que o advogado recebe.
//
// Três saídas, todas geradas no aparelho (nada sobe para servidor):
// 1. planilha.csv — uma linha por despesa ativa, abre no Excel / Google Sheets
// 2. pasta .zip — planilha + pagamentos.csv + custo_x_pensao.csv + comprovantes
//    renomeados no padrão + índice com os selos
// 3. relatório imprimível (/relatorio) — vira PDF pelo "Imprimir" do navegador
//
// Regra 1 do produto: baixar os próprios arquivos é sempre grátis. A trava de
// pagamento, quando existir, fica no artefato gerado (pasta/relatório), não aqui.

import type { Combinado, Despesa, Filho, Pagamento } from "./types";
import { filhosAtuais, idade, listarNomes, nomeDoFilho } from "./filhos";
import { categoria as infoCategoria } from "./categorias";
import { formatPercentual } from "./rateio";
import { montarZip, type EntradaZip } from "./zip";
import { obterBlob } from "./store";
import { nomeForma } from "./pagamentos";
import { combinadoAtual, devidoNoMes, diasAposVencimento, mesAtual, mesesEntre, mesesPensao } from "./pensao";
import { calcularAtrasados, descreverParametros, PARAMETROS_PADRAO, type Atrasados } from "./atrasados";
import { INDICES_EMBUTIDOS, type Indices } from "./indices";

/** Período inclusivo em meses: "2026-07" a "2026-09". null = tudo. */
export interface Periodo {
  de: string;
  ate: string;
}

export interface Preparado {
  /** versão atual de cada linhagem, sem retiradas, ordenada por data do fato asc */
  ativas: Despesa[];
  /** versão atual das linhagens retiradas */
  retiradas: Despesa[];
  /** linhagem -> criado_em da versão 1 (quando entrou no cofre) */
  primeiraEntrada: Map<string, string>;
  /** linhagem -> número de versões */
  versoes: Map<string, number>;
  /** meses (YYYY-MM) com despesa ativa ou pagamento ativo, ordenados */
  meses: string[];
  /** pagamentos de pensão ativos, por mês de referência asc */
  pagamentos: Pagamento[];
  pagamentosRetirados: Pagamento[];
  /** log do valor combinado (todas as versões) */
  combinado: Combinado[];
  /** filhos ativos (versão atual), na ordem de cadastro */
  filhos: Filho[];
  /** linhagem do filho → nome atual (inclui retirados, para despesas antigas) */
  nomesFilhos: Map<string, string>;
}

/** Do log cru para o que a exportação precisa. */
export function preparar(log: Despesa[], logPagamentos: Pagamento[] = [], logCombinado: Combinado[] = [], logFilhos: Filho[] = []): Preparado {
  const porLinhagem = new Map<string, Despesa[]>();
  for (const d of log) {
    const arr = porLinhagem.get(d.linhagem) ?? [];
    arr.push(d);
    porLinhagem.set(d.linhagem, arr);
  }
  const ativas: Despesa[] = [];
  const retiradas: Despesa[] = [];
  const primeiraEntrada = new Map<string, string>();
  const versoes = new Map<string, number>();
  for (const [linhagem, vs] of porLinhagem) {
    vs.sort((a, b) => a.versao - b.versao);
    primeiraEntrada.set(linhagem, vs[0].criado_em);
    versoes.set(linhagem, vs.length);
    const atual = vs[vs.length - 1];
    (atual.retirada ? retiradas : ativas).push(atual);
  }
  const ordenar = (a: Despesa, b: Despesa) =>
    a.data_do_fato === b.data_do_fato ? a.criado_em.localeCompare(b.criado_em) : a.data_do_fato.localeCompare(b.data_do_fato);
  ativas.sort(ordenar);
  retiradas.sort(ordenar);

  // pagamentos: mesma lógica, chaveada por linhagem nos mesmos mapas (ids são únicos)
  const porLinhagemP = new Map<string, Pagamento[]>();
  for (const p of logPagamentos) porLinhagemP.set(p.linhagem, [...(porLinhagemP.get(p.linhagem) ?? []), p]);
  const pagamentos: Pagamento[] = [];
  const pagamentosRetirados: Pagamento[] = [];
  for (const [linhagem, vs] of porLinhagemP) {
    vs.sort((a, b) => a.versao - b.versao);
    primeiraEntrada.set(linhagem, vs[0].criado_em);
    versoes.set(linhagem, vs.length);
    const atual = vs[vs.length - 1];
    (atual.retirada ? pagamentosRetirados : pagamentos).push(atual);
  }
  const ordenarP = (a: Pagamento, b: Pagamento) =>
    a.referencia === b.referencia ? a.data_do_fato.localeCompare(b.data_do_fato) : a.referencia.localeCompare(b.referencia);
  pagamentos.sort(ordenarP);
  pagamentosRetirados.sort(ordenarP);

  const meses = Array.from(new Set([...ativas.map((d) => d.data_do_fato.slice(0, 7)), ...pagamentos.map((p) => p.referencia)])).sort();
  const todosFilhos = filhosAtuais(logFilhos);
  return {
    ativas,
    retiradas,
    primeiraEntrada,
    versoes,
    meses,
    pagamentos,
    pagamentosRetirados,
    combinado: [...logCombinado].sort((a, b) => a.versao - b.versao),
    filhos: todosFilhos.filter((f) => !f.retirada),
    nomesFilhos: new Map(todosFilhos.map((f) => [f.linhagem, f.nome])),
  };
}

export function mesNoPeriodo(mes: string, p: Periodo | null): boolean {
  return !p || (mes >= p.de && mes <= p.ate);
}

export function noPeriodo(d: Despesa, p: Periodo | null): boolean {
  return mesNoPeriodo(d.data_do_fato.slice(0, 7), p);
}

/** Pagamento entra no período pelo mês de referência (a pensão de setembro conta em setembro). */
export function pagamentoNoPeriodo(pg: Pagamento, p: Periodo | null): boolean {
  return mesNoPeriodo(pg.referencia, p);
}

// ---------- nomes ----------

const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

function extensao(d: { comprovante?: Despesa["comprovante"] }): string {
  const c = d.comprovante;
  if (!c) return "bin";
  if (EXT_POR_MIME[c.mime]) return EXT_POR_MIME[c.mime];
  const m = c.nomeOriginal?.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "bin";
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function valorNome(c: number): string {
  return (c / 100).toFixed(2).replace(".", "-");
}

/**
 * Um nome de arquivo por comprovante (blobKey). Comprovante de uma despesa só:
 * data_categoria_valor_selo.ext. Comprovante compartilhado por várias despesas
 * (print de fatura): data_lote_selo.ext — o índice diz quais despesas apontam para ele.
 */
export function nomesDosComprovantes(despesas: Despesa[], pagamentos: Pagamento[] = []): Map<string, string> {
  const porBlob = new Map<string, Despesa[]>();
  for (const d of despesas) {
    if (!d.comprovante) continue;
    const arr = porBlob.get(d.comprovante.blobKey) ?? [];
    arr.push(d);
    porBlob.set(d.comprovante.blobKey, arr);
  }
  const nomes = new Map<string, string>();
  const usados = new Set<string>();
  const reservar = (blobKey: string, base: string, ext: string) => {
    let nome = `${base}.${ext}`;
    let n = 2;
    while (usados.has(nome)) nome = `${base}_${n++}.${ext}`;
    usados.add(nome);
    nomes.set(blobKey, nome);
  };
  for (const [blobKey, ds] of porBlob) {
    const d0 = ds[0];
    const selo = d0.comprovante!.sha256.slice(0, 10);
    const data = ds.map((d) => d.data_do_fato).sort()[0];
    const base =
      ds.length === 1
        ? `${data}_${slug(infoCategoria(d0.categoria).nome)}_${valorNome(d0.rateio?.total_centavos ?? d0.valor_centavos)}_${selo}`
        : `${data}_lote-${ds.length}-despesas_${selo}`;
    reservar(blobKey, base, extensao(d0));
  }
  // pagamentos de pensão: data-recebida_pensao-YYYY-MM_valor_selo.ext
  for (const p of pagamentos) {
    if (!p.comprovante || nomes.has(p.comprovante.blobKey)) continue;
    reservar(p.comprovante.blobKey, `${p.data_do_fato}_pensao-${p.referencia}_${valorNome(p.valor_centavos)}_${p.comprovante.sha256.slice(0, 10)}`, extensao(p));
  }
  return nomes;
}

// ---------- CSV ----------

function csvCampo(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function centavosCSV(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",");
}

function dataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const BOM = "\uFEFF";
const FIM = "\r\n";

export function gerarCSV(ativas: Despesa[], prep: Preparado, nomes: Map<string, string>): string {
  const cab = [
    "data_da_despesa",
    "filho",
    "categoria",
    "descricao",
    "valor_parte_do_filho",
    "total_do_comprovante",
    "percentual_do_filho",
    "criterio_da_divisao",
    "comprovante_arquivo",
    "comprovante_sha256",
    "registrado_no_cofre_em",
    "versoes",
    "mesmo_comprovante_de_outras",
  ];
  const linhas = ativas.map((d) =>
    [
      dataBR(d.data_do_fato),
      nomeDoFilho(d.filho, prep.nomesFilhos, prep.filhos.length > 1 ? "todos" : ""),
      infoCategoria(d.categoria).nome,
      d.observacao ?? "",
      centavosCSV(d.valor_centavos),
      d.rateio ? centavosCSV(d.rateio.total_centavos) : centavosCSV(d.valor_centavos),
      d.rateio ? formatPercentual(d.rateio.percentual) : "100%",
      d.rateio?.criterio ?? "",
      d.comprovante ? nomes.get(d.comprovante.blobKey) ?? "" : "SEM COMPROVANTE",
      d.comprovante?.sha256 ?? "",
      dataHoraBR(prep.primeiraEntrada.get(d.linhagem) ?? d.criado_em),
      String(prep.versoes.get(d.linhagem) ?? 1),
      d.lote ? "sim" : "",
    ]
      .map(csvCampo)
      .join(";"),
  );
  const total = ativas.reduce((s, d) => s + d.valor_centavos, 0);
  const rodape = ["TOTAL", "", "", "", centavosCSV(total)].map(csvCampo).join(";");
  return BOM + [cab.join(";"), ...linhas, rodape].join(FIM) + FIM;
}

export function gerarCSVRetiradas(retiradas: Despesa[], prep: Preparado): string {
  const cab = ["data_da_despesa", "categoria", "descricao", "valor", "retirada_em", "motivo", "registrado_no_cofre_em", "comprovante_sha256"];
  const linhas = retiradas.map((d) =>
    [
      dataBR(d.data_do_fato),
      infoCategoria(d.categoria).nome,
      d.observacao ?? "",
      centavosCSV(d.valor_centavos),
      dataHoraBR(d.criado_em),
      d.motivo ?? "",
      dataHoraBR(prep.primeiraEntrada.get(d.linhagem) ?? d.criado_em),
      d.comprovante?.sha256 ?? "",
    ]
      .map(csvCampo)
      .join(";"),
  );
  return BOM + [cab.join(";"), ...linhas].join(FIM) + FIM;
}

function mesBR(m: string): string {
  const [a, mm] = m.split("-");
  return `${mm}/${a}`;
}

export function gerarCSVPagamentos(pagamentos: Pagamento[], prep: Preparado, nomes: Map<string, string>): string {
  const cab = [
    "pensao_de",
    "recebido_em",
    "valor",
    "forma",
    "observacao",
    "combinado_no_mes",
    "dias_apos_vencimento",
    "comprovante_arquivo",
    "comprovante_sha256",
    "registrado_no_cofre_em",
    "versoes",
  ];
  const linhas = pagamentos.map((p) => {
    const dev = devidoNoMes(prep.combinado, p.referencia);
    return [
      mesBR(p.referencia),
      dataBR(p.data_do_fato),
      centavosCSV(p.valor_centavos),
      nomeForma(p.forma),
      p.observacao ?? "",
      dev ? centavosCSV(dev.valor) : "",
      dev ? String(diasAposVencimento(p, dev.dia)) : "",
      p.comprovante ? nomes.get(p.comprovante.blobKey) ?? "" : "SEM COMPROVANTE",
      p.comprovante?.sha256 ?? "",
      dataHoraBR(prep.primeiraEntrada.get(p.linhagem) ?? p.criado_em),
      String(prep.versoes.get(p.linhagem) ?? 1),
    ]
      .map(csvCampo)
      .join(";");
  });
  const total = pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
  const rodape = ["TOTAL", "", centavosCSV(total)].map(csvCampo).join(";");
  return BOM + [cab.join(";"), ...linhas, rodape].join(FIM) + FIM;
}

export function gerarCSVPagamentosRetirados(retirados: Pagamento[], prep: Preparado): string {
  const cab = ["pensao_de", "recebido_em", "valor", "retirado_em", "motivo", "registrado_no_cofre_em", "comprovante_sha256"];
  const linhas = retirados.map((p) =>
    [
      mesBR(p.referencia),
      dataBR(p.data_do_fato),
      centavosCSV(p.valor_centavos),
      dataHoraBR(p.criado_em),
      p.motivo ?? "",
      dataHoraBR(prep.primeiraEntrada.get(p.linhagem) ?? p.criado_em),
      p.comprovante?.sha256 ?? "",
    ]
      .map(csvCampo)
      .join(";"),
  );
  return BOM + [cab.join(";"), ...linhas].join(FIM) + FIM;
}

export interface LinhaMensal {
  mes: string;
  custo: number;
  combinado: number | null;
  recebido: number;
}

/** Mês a mês, no período: custo do filho (despesas ativas), pensão combinada e pensão recebida. */
export function resumoMensal(ativas: Despesa[], pagamentos: Pagamento[], combinado: Combinado[], periodo: Periodo | null): LinhaMensal[] {
  const meses = [...ativas.map((d) => d.data_do_fato.slice(0, 7)), ...pagamentos.map((p) => p.referencia)];
  for (const c of combinado) if (!c.retirada && mesNoPeriodo(c.vigente_desde, periodo)) meses.push(c.vigente_desde);
  if (meses.length === 0) return [];
  const de = periodo?.de ?? meses.reduce((a, b) => (b < a ? b : a));
  let ate = periodo?.ate ?? meses.reduce((a, b) => (b > a ? b : a));
  // com valor combinado vigente, os meses sem pagamento até hoje também contam
  if (!periodo && combinadoAtual(combinado) && mesAtual() > ate) ate = mesAtual();
  return mesesEntre(de, ate).map((mes) => ({
    mes,
    custo: ativas.filter((d) => d.data_do_fato.slice(0, 7) === mes).reduce((s, d) => s + d.valor_centavos, 0),
    combinado: devidoNoMes(combinado, mes)?.valor ?? null,
    recebido: pagamentos.filter((p) => p.referencia === mes).reduce((s, p) => s + p.valor_centavos, 0),
  }));
}

export function gerarCSVMensal(linhas: LinhaMensal[]): string {
  const cab = ["mes", "custo_do_filho", "pensao_combinada", "pensao_recebida", "custo_menos_recebida", "faltou_do_combinado"];
  const corpo = linhas.map((l) =>
    [
      mesBR(l.mes),
      centavosCSV(l.custo),
      l.combinado === null ? "" : centavosCSV(l.combinado),
      centavosCSV(l.recebido),
      centavosCSV(l.custo - l.recebido),
      l.combinado === null ? "" : centavosCSV(Math.max(0, l.combinado - l.recebido)),
    ]
      .map(csvCampo)
      .join(";"),
  );
  const tc = linhas.reduce((s, l) => s + l.custo, 0);
  const tr = linhas.reduce((s, l) => s + l.recebido, 0);
  const tcomb = linhas.reduce((s, l) => s + (l.combinado ?? 0), 0);
  const tf = linhas.reduce((s, l) => s + (l.combinado === null ? 0 : Math.max(0, l.combinado - l.recebido)), 0);
  const rodape = ["TOTAL", centavosCSV(tc), centavosCSV(tcomb), centavosCSV(tr), centavosCSV(tc - tr), centavosCSV(tf)].map(csvCampo).join(";");
  return BOM + [cab.join(";"), ...corpo, rodape].join(FIM) + FIM;
}

export function gerarCSVAtrasados(a: Atrasados): string {
  const cab = ["mes", "vencimento", "combinado", "recebido", "em_aberto", "fator_correcao", "corrigido", "dias_de_atraso", "juros", "total_atualizado", "janela_art_528_7", "meses_sem_indice"];
  const janela = new Set(a.tresMaisRecentes.meses);
  const linhas = a.parcelas.map((x) =>
    [
      mesBR(x.mes),
      dataBR(x.vencimento),
      centavosCSV(x.devido),
      centavosCSV(x.recebido),
      centavosCSV(x.aberto),
      x.fator.toFixed(6).replace(".", ","),
      centavosCSV(x.corrigido),
      String(x.dias),
      centavosCSV(x.juros),
      centavosCSV(x.total),
      janela.has(x.mes) ? "sim" : "",
      x.semIndice.join(" "),
    ]
      .map(csvCampo)
      .join(";"),
  );
  const rodape = ["TOTAL", "", "", "", centavosCSV(a.totalAberto), "", centavosCSV(a.totalCorrigido), "", centavosCSV(a.totalJuros), centavosCSV(a.total)].map(csvCampo).join(";");
  const nota = [
    `CRITERIO;${descreverParametros(a.parametros)}; data do calculo ${dataBR(a.parametros.dataCalculo)}${a.indiceAte ? `; indice disponivel ate ${mesBR(a.indiceAte)}` : ""}`,
    `NOTA;Conta aritmetica sobre o que foi registrado. Indice, juros e data-base sao definidos pela sentenca ou pelo juizo. A coluna janela_art_528_7 marca as 3 prestacoes vencidas mais recentes.`,
  ];
  return BOM + [cab.join(";"), ...linhas, rodape, ...nota].join(FIM) + FIM;
}

/** Atrasados do período com os parâmetros padrão (INPC, 1% a.m.), para a pasta e o relatório. */
export function atrasadosDaPasta(prep: Preparado, periodo: Periodo | null, indices: Indices = INDICES_EMBUTIDOS, dataCalculo = new Date().toISOString().slice(0, 10)): Atrasados | null {
  if (!combinadoAtual(prep.combinado)) return null;
  const meses = mesesPensao(
    prep.pagamentos.map((p) => ({ ...p, historico: 1 })),
    prep.combinado,
    dataCalculo.slice(0, 7),
  ).filter((m) => mesNoPeriodo(m.mes, periodo));
  const a = calcularAtrasados(meses, indices, { ...PARAMETROS_PADRAO, dataCalculo });
  return a.parcelas.length ? a : null;
}

// ---------- índice ----------

export function gerarIndice(
  ativas: Despesa[],
  retiradas: Despesa[],
  prep: Preparado,
  nomes: Map<string, string>,
  periodo: Periodo | null,
  pagamentos: Pagamento[] = [],
  pagamentosRetirados: Pagamento[] = [],
  atrasados: Atrasados | null = null,
): string {
  const agora = new Date();
  const comComprovante = ativas.filter((d) => d.comprovante).length;
  const total = ativas.reduce((s, d) => s + d.valor_centavos, 0);
  const totalPensao = pagamentos.reduce((s, p) => s + p.valor_centavos, 0);
  const l: string[] = [];
  l.push("ALIMENTAPROVA — PASTA DE DESPESAS DO FILHO E PENSÃO RECEBIDA");
  l.push("");
  l.push(`Gerada em: ${dataHoraBR(agora.toISOString())} (horário do aparelho)`);
  l.push(`Período: ${periodo ? `${periodo.de} a ${periodo.ate}` : "todo o acervo"}`);
  if (prep.filhos.length) l.push(`Filhos: ${listarNomes(prep.filhos.map((f) => (idade(f.nascimento) ? `${f.nome} (${idade(f.nascimento)})` : f.nome)))}`);
  l.push(`Despesas: ${ativas.length} (${comComprovante} com comprovante) — total da parte do filho: R$ ${centavosCSV(total)}`);
  if (prep.filhos.length > 1) {
    for (const f of prep.filhos) {
      const das = ativas.filter((d) => d.filho === f.linhagem);
      l.push(`  ${f.nome}: ${das.length} despesas — R$ ${centavosCSV(das.reduce((s, d) => s + d.valor_centavos, 0))}`);
    }
    const comuns = ativas.filter((d) => !d.filho);
    if (comuns.length) l.push(`  de todos / da casa: ${comuns.length} despesas — R$ ${centavosCSV(comuns.reduce((s, d) => s + d.valor_centavos, 0))}`);
  }
  if (retiradas.length) l.push(`Retiradas do cofre (não contam, listadas em retiradas.csv): ${retiradas.length}`);
  if (pagamentos.length || pagamentosRetirados.length) {
    l.push(`Pagamentos de pensão: ${pagamentos.length} (${pagamentos.filter((p) => p.comprovante).length} com comprovante) — total recebido: R$ ${centavosCSV(totalPensao)}`);
    if (pagamentosRetirados.length) l.push(`Pagamentos retirados do cofre (não contam, em pagamentos_retirados.csv): ${pagamentosRetirados.length}`);
  }
  if (atrasados) l.push(`Em aberto (combinado − recebido): R$ ${centavosCSV(atrasados.totalAberto)} em ${atrasados.parcelas.length} meses — atualizado: R$ ${centavosCSV(atrasados.total)} (${descreverParametros(atrasados.parametros)})`);
  l.push("");
  l.push("O QUE TEM AQUI");
  l.push("planilha.csv        uma linha por despesa; abre no Excel ou Google Sheets (separador ;)");
  if (pagamentos.length) l.push("pagamentos.csv      uma linha por pagamento de pensão recebido, com o mês a que se refere");
  l.push("custo_x_pensao.csv  mês a mês: custo do filho, pensão combinada, pensão recebida e a diferença");
  if (atrasados) l.push("atrasados.csv       memória de cálculo do que ficou em aberto: correção, juros, total por parcela e critério usado");
  l.push("comprovantes/       os arquivos originais, renomeados: data_categoria_valor_selo.ext");
  l.push("                    (um print com várias despesas aparece uma vez, como data_lote-N-despesas_selo.ext;");
  l.push("                     comprovante de pensão: data_pensao-MES_valor_selo.ext)");
  if (retiradas.length) l.push("retiradas.csv       despesas retiradas do cofre pela parte, com data e motivo");
  if (pagamentosRetirados.length) l.push("pagamentos_retirados.csv  pagamentos retirados do cofre pela parte, com data e motivo");
  l.push("");
  l.push("COMO LER");
  if (prep.filhos.length > 1) l.push("filho                  de qual filho é a despesa; \"todos\" = da casa ou de todos os filhos juntos.");
  l.push("valor_parte_do_filho   é o que conta. Quando só uma fração do comprovante é do filho, a planilha");
  l.push("                       traz também o total do comprovante, o percentual e o critério declarado.");
  l.push("registrado_no_cofre_em quando a despesa entrou no cofre (distinto da data da despesa).");
  l.push("versoes                quantas versões o registro tem; edições nunca apagam a anterior.");
  l.push("pensao_de              o mês da pensão a que o pagamento se refere (pode diferir do mês em que entrou).");
  l.push("combinado_no_mes       o valor combinado/fixado que valia naquele mês, conforme registrado pela parte");
  l.push("                       (se fixado em % do salário mínimo, calculado com o mínimo vigente no mês).");
  l.push("selo                   SHA-256 dos bytes do arquivo, calculado no aparelho no momento do registro.");
  l.push("                       Recalcular o SHA-256 do arquivo desta pasta deve dar o mesmo valor:");
  l.push("");
  l.push("SELOS");
  const vistos = new Set<string>();
  for (const d of [...ativas, ...pagamentos]) {
    if (!d.comprovante || vistos.has(d.comprovante.blobKey)) continue;
    vistos.add(d.comprovante.blobKey);
    l.push(`${d.comprovante.sha256}  comprovantes/${nomes.get(d.comprovante.blobKey)}`);
  }
  l.push("");
  l.push("Este material organiza registros feitos pela própria parte. Não é parecer jurídico.");
  return l.join("\n") + "\n";
}

// ---------- montagem ----------

export function nomePasta(periodo: Periodo | null): string {
  const hoje = new Date().toISOString().slice(0, 10);
  return periodo ? `AlimentaProva_${periodo.de}_a_${periodo.ate}` : `AlimentaProva_tudo_${hoje}`;
}

/** Tudo que entra na pasta, já filtrado pelo período e com os nomes de arquivo decididos. */
export function conteudoDaPasta(prep: Preparado, periodo: Periodo | null, indices: Indices = INDICES_EMBUTIDOS) {
  const ativas = prep.ativas.filter((d) => noPeriodo(d, periodo));
  const retiradas = prep.retiradas.filter((d) => noPeriodo(d, periodo));
  const pagamentos = prep.pagamentos.filter((p) => pagamentoNoPeriodo(p, periodo));
  const pagamentosRetirados = prep.pagamentosRetirados.filter((p) => pagamentoNoPeriodo(p, periodo));
  const nomes = nomesDosComprovantes(ativas, pagamentos);
  const atrasados = atrasadosDaPasta(prep, periodo, indices);
  const arquivos: Array<{ nome: string; texto: string; mime: string }> = [
    { nome: "LEIA-ME.txt", texto: gerarIndice(ativas, retiradas, prep, nomes, periodo, pagamentos, pagamentosRetirados, atrasados), mime: "text/plain; charset=utf-8" },
    { nome: "planilha.csv", texto: gerarCSV(ativas, prep, nomes), mime: "text/csv; charset=utf-8" },
    { nome: "custo_x_pensao.csv", texto: gerarCSVMensal(resumoMensal(ativas, pagamentos, prep.combinado, periodo)), mime: "text/csv; charset=utf-8" },
  ];
  if (pagamentos.length) arquivos.push({ nome: "pagamentos.csv", texto: gerarCSVPagamentos(pagamentos, prep, nomes), mime: "text/csv; charset=utf-8" });
  if (atrasados) arquivos.push({ nome: "atrasados.csv", texto: gerarCSVAtrasados(atrasados), mime: "text/csv; charset=utf-8" });
  if (retiradas.length) arquivos.push({ nome: "retiradas.csv", texto: gerarCSVRetiradas(retiradas, prep), mime: "text/csv; charset=utf-8" });
  if (pagamentosRetirados.length)
    arquivos.push({ nome: "pagamentos_retirados.csv", texto: gerarCSVPagamentosRetirados(pagamentosRetirados, prep), mime: "text/csv; charset=utf-8" });
  return { ativas, retiradas, pagamentos, pagamentosRetirados, nomes, arquivos, atrasados };
}

export async function montarPasta(
  prep: Preparado,
  periodo: Periodo | null,
  aoProgredir?: (feitos: number, total: number) => void,
  indices: Indices = INDICES_EMBUTIDOS,
): Promise<{ blob: Blob; nome: string }> {
  const { nomes, arquivos } = conteudoDaPasta(prep, periodo, indices);
  const pasta = nomePasta(periodo);
  const enc = new TextEncoder();
  const entradas: EntradaZip[] = arquivos.map((a) => ({ nome: `${pasta}/${a.nome}`, dados: enc.encode(a.texto) }));

  const chaves = Array.from(nomes.keys());
  let feitos = 0;
  for (const blobKey of chaves) {
    const b = await obterBlob(blobKey);
    if (b) {
      const bytes = new Uint8Array(await b.arrayBuffer());
      entradas.push({ nome: `${pasta}/comprovantes/${nomes.get(blobKey)}`, dados: bytes });
    }
    feitos++;
    aoProgredir?.(feitos, chaves.length);
  }

  return { blob: montarZip(entradas), nome: `${pasta}.zip` };
}

export function montarPlanilha(prep: Preparado, periodo: Periodo | null): { blob: Blob; nome: string } {
  const ativas = prep.ativas.filter((d) => noPeriodo(d, periodo));
  const nomes = nomesDosComprovantes(ativas);
  const csv = gerarCSV(ativas, prep, nomes);
  return { blob: new Blob([csv], { type: "text/csv;charset=utf-8" }), nome: `${nomePasta(periodo)}.csv` };
}

// ---------- entrega ----------

export function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function podeCompartilhar(blob: Blob, nome: string): boolean {
  if (typeof navigator === "undefined" || !("share" in navigator) || !("canShare" in navigator)) return false;
  try {
    const f = new File([blob], nome, { type: blob.type });
    return navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

/** true se o compartilhamento aconteceu; false se o navegador não suporta ou a pessoa cancelou */
export async function compartilhar(blob: Blob, nome: string, titulo: string): Promise<boolean> {
  if (!podeCompartilhar(blob, nome)) return false;
  try {
    await navigator.share({ files: [new File([blob], nome, { type: blob.type })], title: titulo });
    return true;
  } catch {
    return false;
  }
}
