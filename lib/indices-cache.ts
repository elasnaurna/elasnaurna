// Busca das séries oficiais no IBGE (via /api/indices) com cache de 24 h no
// aparelho. Sem rede: o que estiver guardado; sem nada: a tabela embutida.

import { createStore, get, set } from "idb-keyval";
import { INDICES_EMBUTIDOS, type Indices } from "./indices";

const cache = createStore("cofre-indices", "indices");
const VALIDADE_MS = 24 * 60 * 60 * 1000;

interface Guardado {
  dados: Indices;
  em: number;
}

/** Indices mais completos que se conseguir: IBGE (se der), senão o guardado, senão o embutido. */
export async function obterIndices(): Promise<Indices> {
  let guardado: Guardado | undefined;
  try {
    guardado = await get<Guardado>("indices", cache);
  } catch {
    guardado = undefined;
  }
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return mesclar(guardado.dados);

  if (typeof fetch !== "undefined") {
    try {
      const r = await fetch("/api/indices", { cache: "no-store" });
      if (r.ok) {
        const dados = (await r.json()) as Indices;
        if (dados && dados.INPC && dados.IPCA) {
          const completo = mesclar(dados);
          try {
            const g: Guardado = { dados: completo, em: Date.now() };
            await set("indices", g, cache);
          } catch {
            /* sem cache, segue */
          }
          return completo;
        }
      }
    } catch {
      /* offline ou IBGE fora — cai para o que tiver */
    }
  }
  return guardado ? mesclar(guardado.dados) : INDICES_EMBUTIDOS;
}

/** Embutido por baixo, série recebida por cima (o IBGE pode revisar um mês). */
function mesclar(d: Indices): Indices {
  return {
    INPC: { ...INDICES_EMBUTIDOS.INPC, ...d.INPC },
    IPCA: { ...INDICES_EMBUTIDOS.IPCA, ...d.IPCA },
    atualizadoEm: d.atualizadoEm,
  };
}

