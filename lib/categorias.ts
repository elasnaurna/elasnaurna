import type { CategoriaId } from "./types";

// Rubricas fixas da gaveta 04, alinhadas à classificação doutrinária
// (ordinária / extraordinária). A classificação é SUGERIDA ao usuário,
// nunca decidida pelo sistema — isso é linha da OAB.

export interface Categoria {
  id: CategoriaId;
  nome: string;
  exemplos: string;
  /** tom da bolinha — sempre via classe, para funcionar nos dois temas */
  dot: string;
}

export const CATEGORIAS: Categoria[] = [
  { id: "educacao", nome: "Educação", exemplos: "mensalidade, material, uniforme, curso", dot: "bg-sky-600" },
  { id: "saude", nome: "Saúde", exemplos: "plano, remédio, consulta, dentista", dot: "bg-rose-600" },
  { id: "alimentacao", nome: "Alimentação", exemplos: "mercado, lanche da escola", dot: "bg-amber-600" },
  { id: "vestuario", nome: "Vestuário", exemplos: "roupa, calçado", dot: "bg-violet-600" },
  { id: "moradia", nome: "Moradia", exemplos: "aluguel, luz, água, internet — rateado", dot: "bg-stone-600" },
  { id: "transporte", nome: "Transporte", exemplos: "van escolar, passagem, combustível", dot: "bg-teal-600" },
  { id: "lazer", nome: "Lazer", exemplos: "esporte, festa, passeio", dot: "bg-emerald-600" },
  { id: "outro", nome: "Outro", exemplos: "o que não couber acima", dot: "bg-zinc-500" },
];

export function categoria(id: CategoriaId): Categoria {
  return CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1];
}
