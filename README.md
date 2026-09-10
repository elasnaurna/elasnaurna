# AlimentaProva

Cofre de provas para pensão alimentícia. Quem administra a pensão registra, no dia, cada despesa do filho (com comprovante) e cada pagamento de pensão que entra — e, quando o advogado pedir, exporta a pasta pronta.

Código: github.com/Di-Pierro-Creative/AlimentaProva · Publicado em https://cofre-flax.vercel.app (PWA: "Adicionar à tela inicial" no celular).

## Princípios que o código carrega

- **Append-only.** Nada é apagado nem sobrescrito. Editar cria uma nova versão; "retirar" é uma versão marcada, com motivo obrigatório, reversível. Na nuvem isso é garantido pelo banco (só ler e inserir — não existe permissão de alterar nem apagar).
- **Duas datas por registro:** `data_do_fato` (quando aconteceu) e `criado_em` (quando entrou no cofre). Na nuvem, ainda `recebido_em` (relógio do servidor).
- **Selo:** SHA-256 de cada comprovante, calculado no aparelho no momento do registro. A chave do arquivo é o próprio hash.
- **O app registra; quem julga é o advogado.** Rateio, valor combinado, custo × pensão: o app mostra os números que a pessoa declarou, sem sugerir percentual nem concluir o que é "devido".
- **Local primeiro.** Tudo funciona no aparelho, offline, sem conta. A conta (Supabase) é a cópia que junta os aparelhos e, depois, o que o advogado vai ver.
- **Baixar os próprios arquivos é grátis, sempre.**

## O que faz

**Filhos** — perfil por filho (nome, nascimento → idade, tamanhos, escola). Cada despesa diz de quem é; lista, planilha e relatório saem por filho. Uma pensão cobre todos os filhos (irmãos do mesmo pai).

**Despesas** — foto/print do comprovante → leitura automática (valor, data, categoria sugerida) → conferir → guardar. Print de fatura de cartão vira vários registros, um por lançamento, com o mesmo comprovante. Rateio: quando só uma parte é do filho (restaurante, mercado), grava o total, o percentual e o critério.

**Pensão** — cada pagamento recebido (print do Pix/extrato, valor, data, mês a que se refere, forma). Valor combinado/fixado — em reais ou em % do salário mínimo — com dia de vencimento e vigência; cada mês mostra combinado × recebido. Gráfico custo do filho × pensão recebida. **Atrasados atualizados** com memória de cálculo (INPC/IPCA + juros, à escolha; recorte das 3 últimas prestações do art. 528, § 7º).

**Exportar** — planilha .csv, pasta .zip (planilha de despesas, pagamentos, custo × pensão mês a mês, comprovantes renomeados `data_categoria_valor_selo.ext`, LEIA-ME com os selos), relatório imprimível (PDF), envio direto para o Google Drive da cliente com acesso de leitura ao advogado.

**Conta** — entrar por e-mail + código de 6 dígitos; sincronização automática entre aparelhos.

## Rodar

```bash
npm install
npm run dev
```

Variáveis de ambiente (todas opcionais — sem elas o app funciona no modo manual, só no aparelho): ver `.env.example`.

Banco da conta: colar `supabase/schema.sql` no SQL Editor do projeto Supabase (uma vez).

## Estrutura

```
app/                      rotas (App Router)
  page.tsx                aba Despesas          → components/ListaDespesas
  pensao/                 aba Pensão            → components/Pensao
  pensao/novo             registrar pagamento   → components/CapturaPagamento
  pensao/combinado        valor combinado       → components/Combinado
  pensao/atrasados        atrasados atualizados → components/Atrasados
  pagamento/[id]          detalhe do pagamento  → components/DetalhePagamento
  nova/                   registrar despesa     → components/CapturaDespesa
  despesa/[id]            detalhe da despesa    → components/DetalheDespesa
  exportar/, relatorio/   exportação            → components/Exportar, Relatorio
  filhos/, filhos/novo, filhos/[id]   perfis dos filhos → components/Filhos, FilhoTela
  conta/                  conta                 → components/Conta
  api/ler-comprovante     leitura automática (servidor)
  api/indices             INPC e IPCA do IBGE, com cache (servidor)
components/
  CabecalhoCofre          cabeçalho com as abas e o estado da conta
  GraficoCustoPensao      gráfico custo × pensão (SVG, sem biblioteca)
  SeletorFilho            chips "de quem é" (usado na captura e na edição)
  RateioPainel, Sincronizador
lib/
  types.ts                modelo de dados — a "etiqueta" de cada registro
  store.ts                despesas: armazenamento append-only (IndexedDB)
  pagamentos.ts           pagamentos e valor combinado (IndexedDB)
  filhos.ts               perfis dos filhos (IndexedDB) + idade, nomes
  pensao.ts               contas mês a mês: devido × recebido, série custo × pensão
  atrasados.ts            memória de cálculo dos atrasados (correção + juros)
  indices.ts, indices-cache.ts, salario-minimo.ts   INPC/IPCA embutidos + busca no IBGE; tabela do salário mínimo
  exportar.ts, zip.ts     planilhas, pasta, índice; gerador ZIP
  drive.ts                Google Drive
  supabase.ts, conta.ts, sync.ts   conta e sincronização
  rateio.ts, format.ts, hash.ts, imagem.ts, categorias.ts   utilitários
supabase/schema.sql       banco e storage da conta (RLS: só ler e inserir)
```
