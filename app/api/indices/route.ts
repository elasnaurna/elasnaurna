import { NextResponse } from "next/server";

// Séries oficiais do IBGE (variação mensal, %): INPC = agregado 1736 / variável 44;
// IPCA = agregado 1737 / variável 63. Cache de 24 h no servidor; o aparelho
// também guarda 24 h. Sem rede, o app usa a tabela embutida em lib/indices.ts.

export const runtime = "nodejs";
export const revalidate = 86400;

const IBGE = "https://servicodados.ibge.gov.br/api/v3/agregados";

async function serie(agregado: number, variavel: number): Promise<Record<string, number>> {
  const r = await fetch(`${IBGE}/${agregado}/periodos/-240/variaveis/${variavel}?localidades=N1[all]`, {
    next: { revalidate: 86400 },
    headers: { accept: "application/json" },
  });
  if (!r.ok) throw new Error(`ibge_${agregado}_${r.status}`);
  const json = (await r.json()) as Array<{ resultados: Array<{ series: Array<{ serie: Record<string, string> }> }> }>;
  const bruto = json?.[0]?.resultados?.[0]?.series?.[0]?.serie ?? {};
  const out: Record<string, number> = {};
  for (const [periodo, valor] of Object.entries(bruto)) {
    // periodo "202601" -> "2026-01"; valor "0.39" (ou "..." quando não divulgado)
    const n = Number(valor);
    if (/^\d{6}$/.test(periodo) && Number.isFinite(n)) out[`${periodo.slice(0, 4)}-${periodo.slice(4, 6)}`] = n;
  }
  return out;
}

export async function GET() {
  try {
    const [INPC, IPCA] = await Promise.all([serie(1736, 44), serie(1737, 63)]);
    if (Object.keys(INPC).length === 0 || Object.keys(IPCA).length === 0) throw new Error("serie_vazia");
    return NextResponse.json({ INPC, IPCA, atualizadoEm: new Date().toISOString() }, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (e) {
    console.error("indices: falha ao consultar o IBGE", e instanceof Error ? e.message : e);
    return NextResponse.json({ erro: "ibge_indisponivel" }, { status: 502 });
  }
}
