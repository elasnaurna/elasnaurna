// Modelo de dados de uma despesa do filho (gaveta 04) + comprovante.
//
// Princípios que este tipo carrega desde o primeiro registro:
// 1. A etiqueta é do sistema, não da cliente — quase tudo aqui é derivado.
// 2. Versionamento: nada é sobrescrito. Editar cria um novo registro com
//    versao+1 apontando para o anterior em `versao_de`. O "atual" é derivado.
// 3. Duas datas distintas: `data_do_fato` (quando a despesa aconteceu) e
//    `criado_em` (quando entrou no cofre). É essa diferença que decide entre
//    art. 434 e art. 435 do CPC.

export type CategoriaId =
  | "educacao"
  | "saude"
  | "alimentacao"
  | "vestuario"
  | "moradia"
  | "transporte"
  | "lazer"
  | "outro";

export interface Comprovante {
  /** chave do blob no armazenamento (IndexedDB hoje; Supabase Storage depois) */
  blobKey: string;
  mime: string;
  tamanho: number;
  /** SHA-256 hex dos bytes exatamente como armazenados */
  sha256: string;
  /** nome original do arquivo, quando houver */
  nomeOriginal?: string;
}

/**
 * Procedência de uma leitura automática do comprovante. Registra o que a IA
 * sugeriu e o que a pessoa confirmou — a sugestão nunca é a decisão.
 */
export interface Leitura {
  modelo: string;
  lido_em: string;
  valor_centavos?: number;
  data?: string;
  estabelecimento?: string;
  categoria?: CategoriaId;
  confianca?: number;
  /** true quando a pessoa manteve os valores lidos sem alterar */
  confirmado_sem_alteracao: boolean;
}

export interface Rateio {
  /** valor total que aparece no comprovante */
  total_centavos: number;
  /** percentual atribuído ao filho, 0–100 (aceita decimais: 33.33) */
  percentual: number;
  /** como se chegou nesse percentual (ex.: "3 pessoas na mesa, 1 criança") */
  criterio?: string;
}

/**
 * O que todo registro do cofre tem em comum — despesa, pagamento de pensão,
 * valor combinado. É o que permite versionar, retirar e sincronizar tudo
 * com o mesmo código.
 */
export interface Registro {
  /** id desta versão do registro */
  id: string;
  /** id da linhagem — igual em todas as versões do mesmo registro */
  linhagem: string;
  versao: number;
  /** id da versão anterior, se esta for uma edição */
  versao_de: string | null;
  /** ISO 8601 — quando este registro entrou no cofre (data_de_obtencao) */
  criado_em: string;
  /**
   * true quando esta versão RETIRA o registro do acervo atual (lançado por
   * engano…). A linhagem inteira continua no log — nada some.
   */
  retirada?: boolean;
  /** por que esta versão existe (por que alterou / por que retirou) */
  motivo?: string;
  /** quem lançou. Hoje só a cliente; depois: advogado, ofício, produzida */
  origem: "cliente";
}

/** Tipos de registro que o cofre guarda (e a nuvem sincroniza) */
export type TipoRegistro = "despesa" | "pagamento" | "combinado" | "filho";

export interface Despesa extends Registro {
  /**
   * De qual filho é a despesa (linhagem do `Filho`). Ausente = não
   * especificado / de todos os filhos (despesa da casa, mercado da família).
   */
  filho?: string;
  /** YYYY-MM-DD — quando a despesa aconteceu (data_do_fato) */
  data_do_fato: string;

  /** a PARTE DO FILHO, em centavos. É o que conta nos totais. */
  valor_centavos: number;
  /**
   * Rateio: quando só uma parte do comprovante é do filho (restaurante em
   * família, mercado, luz). Guarda o total que o comprovante mostra e a
   * proporção declarada — o critério é de quem lança; o juízo, do advogado.
   */
  rateio?: Rateio;
  categoria: CategoriaId;
  observacao?: string;

  comprovante?: Comprovante;
  /** leitura automática, quando houve */
  leitura?: Leitura;
  /**
   * id do lote quando várias despesas nasceram do mesmo comprovante
   * (ex.: print de fatura de cartão). Liga os registros irmãos.
   */
  lote?: string;
}

/** Visão "atual" de uma linhagem: a versão mais alta */
export type DespesaAtual = Despesa & { historico: number };

// ---------------------------------------------------------------------------
// Pensão: o que ENTRA. Espelho das despesas (o que SAI). Cruzar os dois é o
// que mostra, mês a mês, quanto do custo do filho a pensão cobre.
// ---------------------------------------------------------------------------

export type FormaPagamento = "pix" | "transferencia" | "dinheiro" | "desconto_folha" | "outro";

/** Um pagamento de pensão recebido. */
export interface Pagamento extends Registro {
  /** YYYY-MM-DD — dia em que o dinheiro entrou */
  data_do_fato: string;
  valor_centavos: number;
  /** YYYY-MM — a que mês da pensão este pagamento se refere */
  referencia: string;
  forma?: FormaPagamento;
  /** quem pagou, como veio, qualquer nota */
  observacao?: string;
  comprovante?: Comprovante;
  /** leitura automática do print/extrato, quando houve */
  leitura?: Leitura;
}

export type PagamentoAtual = Pagamento & { historico: number };

/**
 * O valor combinado (ou fixado em juízo) da pensão. Uma linhagem só; cada
 * mudança de valor (acordo novo, revisional) é uma versão nova, com
 * `vigente_desde`. Assim o app sabe o que era devido em cada mês.
 */
export interface Combinado extends Registro {
  /**
   * Como o valor foi fixado. "reais" (padrão): `valor_centavos` fixo.
   * "sm": `percentual_sm` do salário mínimo vigente em cada mês — o app calcula
   * o valor do mês pela tabela oficial; `valor_centavos` guarda o valor no mês
   * em que foi registrado, só para referência.
   */
  modo?: "reais" | "sm";
  /** percentual do salário mínimo (ex.: 30 = 30%; 150 = um salário e meio) */
  percentual_sm?: number;
  valor_centavos: number;
  /** dia do mês em que vence (1–31) */
  dia_vencimento: number;
  /** YYYY-MM — a partir de que mês vale este valor */
  vigente_desde: string;
  /** de onde vem o valor: "acordo de 03/2025", "sentença", "liminar"… */
  observacao?: string;
}

// ---------------------------------------------------------------------------
// Filhos: quem são as crianças. Dados de menor — o mínimo que serve ao dia a
// dia e ao advogado (nome e idade). Saúde fica de fora do app.
// ---------------------------------------------------------------------------

export interface Filho extends Registro {
  /** como a pessoa chama (primeiro nome ou apelido basta) */
  nome: string;
  /** YYYY-MM-DD — para mostrar a idade */
  nascimento?: string;
  /** tamanho de roupa, texto livre ("8", "M", "10 anos") — só ajuda a comprar */
  roupa?: string;
  /** número do calçado */
  calcado?: string;
  escola?: string;
  observacao?: string;
}

export type FilhoAtual = Filho & { historico: number };
