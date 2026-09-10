// Lê um comprovante com um modelo de visão e devolve valor, data, estabelecimento
// e uma categoria SUGERIDA. Roda no servidor (Vercel) para a chave não ir ao app.
//
// Se ANTHROPIC_API_KEY não estiver configurada, responde 503 e o app segue no
// modo manual. Nada quebra.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const CATEGORIAS_VALIDAS = new Set([
  "educacao",
  "saude",
  "alimentacao",
  "vestuario",
  "moradia",
  "transporte",
  "lazer",
  "outro",
]);

const MODELO_PADRAO = "claude-haiku-4-5";

const INSTRUCOES = `Você lê comprovantes brasileiros de despesas com filhos. Podem ser FOTOS (cupom fiscal, NFC-e, boleto, recibo, nota de serviço, carnê) ou PRINTS DE TELA (comprovante de Pix/TED, app de banco, fatura ou lançamento de cartão de crédito, app de compras, boleto pago no app, recibo de mensalidade por e-mail).

Hoje é {HOJE}.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, no formato:
{
  "e_comprovante": true ou false,
  "tipo": "unico" ou "lista",
  "itens": [
    {
      "descricao": string curta (estabelecimento ou favorecido, como aparece),
      "valor_centavos": inteiro ou null,
      "data": "YYYY-MM-DD" ou null,
      "categoria": uma de ["educacao","saude","alimentacao","vestuario","moradia","transporte","lazer","outro"] ou null,
      "confianca": número de 0 a 1
    }
  ],
  "resumo": string de até 60 caracteres, ou null
}

Regras:
- tipo "unico": a imagem retrata UMA despesa (nota, recibo, Pix, boleto, um lançamento de cartão aberto/destacado). itens tem exatamente 1 elemento. valor_centavos é o total efetivamente pago (R$ 89,90 -> 8990). Em Pix/TED, o valor transferido.
- tipo "lista": a imagem mostra VÁRIOS lançamentos (fatura de cartão, extrato bancário, histórico de compras). Devolva TODOS os lançamentos visíveis e legíveis em itens, um por linha, na ordem em que aparecem, até 40. NÃO inclua linhas que não são despesas: total da fatura, pagamento recebido, limite, saldo, juros, encargos, "pagamento de fatura", estornos e créditos. Para cada item, valor_centavos é o valor daquele lançamento. Parcelas ("3/10") são um lançamento normal com o valor da parcela.
- data: a data da compra/lançamento, não o vencimento. Se só houver dia e mês (ex.: "12 SET", "12/09"), use o ano de hoje; se isso resultar em data no futuro, use o ano anterior. Se não houver data legível, null.
- categoria por item: escola/creche/material/uniforme/curso/mensalidade -> educacao; farmácia/drogaria/clínica/plano de saúde/dentista/exame/laboratório -> saude; supermercado/padaria/restaurante/lanchonete/iFood -> alimentacao; loja de roupa/calçado -> vestuario; aluguel/luz/água/gás/internet/condomínio -> moradia; van/ônibus/passagem/combustível/Uber/99 -> transporte; esporte/natação/festa/passeio/cinema/brinquedo/streaming -> lazer; Pix para pessoa física sem contexto -> outro; senão -> outro.
- Se a imagem não for comprovante nem lista de despesas (selfie, paisagem, texto aleatório), e_comprovante = false, tipo "unico", itens = [].
- Não invente. Se um campo não estiver legível, use null e reduza a confiança.`;

interface ItemLido {
  descricao: string | null;
  valor_centavos: number | null;
  data: string | null;
  categoria: string | null;
  confianca: number;
}

interface Leitura {
  e_comprovante: boolean;
  tipo: "unico" | "lista";
  itens: ItemLido[];
  resumo: string | null;
}

function hojeISO(): string {
  const d = new Date();
  // fuso de Brasília para a data "de hoje" que vai ao modelo
  const sp = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mm = String(sp.getMonth() + 1).padStart(2, "0");
  const dd = String(sp.getDate()).padStart(2, "0");
  return `${sp.getFullYear()}-${mm}-${dd}`;
}

function sanearItem(x: unknown): ItemLido | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const valor =
    typeof o.valor_centavos === "number" && Number.isFinite(o.valor_centavos) && o.valor_centavos > 0
      ? Math.round(o.valor_centavos)
      : null;
  return {
    descricao: typeof o.descricao === "string" ? o.descricao.slice(0, 80) : null,
    valor_centavos: valor,
    data: typeof o.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.data) ? o.data : null,
    categoria: typeof o.categoria === "string" && CATEGORIAS_VALIDAS.has(o.categoria) ? o.categoria : null,
    confianca: typeof o.confianca === "number" ? Math.min(1, Math.max(0, o.confianca)) : 0.5,
  };
}

export async function POST(req: Request) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    return NextResponse.json({ erro: "leitura_nao_configurada" }, { status: 503 });
  }

  let corpo: { base64?: string; mime?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo_invalido" }, { status: 400 });
  }
  const { base64, mime } = corpo;
  if (!base64 || !mime || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) {
    return NextResponse.json({ erro: "imagem_invalida" }, { status: 400 });
  }
  // ~6 MB em base64 já é muito para uma leitura; o app reduz antes de enviar
  if (base64.length > 8_000_000) {
    return NextResponse.json({ erro: "imagem_grande" }, { status: 413 });
  }

  const modelo = process.env.OCR_MODEL || MODELO_PADRAO;

  const resposta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: 2000,
      temperature: 0,
      system: INSTRUCOES.replace("{HOJE}", hojeISO()),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
            { type: "text", text: "Leia este comprovante." },
          ],
        },
      ],
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    console.error("ler-comprovante: erro do modelo", resposta.status, detalhe.slice(0, 500));
    return NextResponse.json({ erro: "modelo_indisponivel" }, { status: 502 });
  }

  const dados = (await resposta.json()) as { content?: Array<{ type: string; text?: string }> };
  const texto = dados.content?.find((c) => c.type === "text")?.text ?? "";
  const leitura = extrairJSON(texto);
  if (!leitura) {
    return NextResponse.json({ erro: "resposta_ilegivel" }, { status: 502 });
  }

  // saneamento: nunca confiar cegamente no que veio do modelo
  const itensBrutos = Array.isArray(leitura.itens) ? leitura.itens : [];
  const itens = itensBrutos
    .slice(0, 40)
    .map(sanearItem)
    .filter((i): i is ItemLido => !!i && (i.valor_centavos !== null || !!i.descricao));

  const saida: Leitura = {
    e_comprovante: leitura.e_comprovante !== false && itens.length > 0,
    tipo: leitura.tipo === "lista" && itens.length > 1 ? "lista" : "unico",
    itens,
    resumo: typeof leitura.resumo === "string" ? leitura.resumo.slice(0, 80) : null,
  };

  return NextResponse.json({ ...saida, modelo });
}

function extrairJSON(texto: string): Partial<Leitura> | null {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1)) as Partial<Leitura>;
  } catch {
    return null;
  }
}
