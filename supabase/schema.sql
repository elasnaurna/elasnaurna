-- AlimentaProva — esquema da conta na nuvem (Supabase)
-- Colar inteiro no SQL Editor do projeto e executar uma vez.
--
-- Princípio: o banco é APPEND-ONLY. Há política para ler e inserir; não há
-- política de update nem de delete. Nem a própria cliente consegue alterar ou
-- apagar um registro pela API — só inserir versões novas. É isso que sustenta
-- o valor probatório do histórico.
--
-- Uma tabela só para todos os tipos de registro (despesa, pagamento de pensão,
-- valor combinado, perfil de filho): as colunas comuns ficam em colunas; o resto vai em `dados`
-- (JSON). Consultar um campo do JSON: dados->>'valor_centavos'.
--
-- LGPD: a exclusão da CONTA inteira (direito de eliminação) é operação
-- separada, feita pelo administrador; por isso o "on delete cascade".

create table if not exists public.registros (
  id           text primary key,
  dono         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo         text not null check (tipo in ('despesa', 'pagamento', 'combinado', 'filho')),
  linhagem     text not null,
  versao       integer not null,
  versao_de    text,
  criado_em    timestamptz not null,               -- relógio do aparelho
  dados        jsonb not null,                     -- o registro inteiro, como está no aparelho
  recebido_em  timestamptz not null default now()  -- relógio do servidor: segunda testemunha da data
);

create index if not exists registros_dono_tipo_idx on public.registros (dono, tipo);
create index if not exists registros_dono_linhagem_idx on public.registros (dono, linhagem);

alter table public.registros enable row level security;

drop policy if exists "dono le seus registros" on public.registros;
create policy "dono le seus registros"
  on public.registros for select to authenticated
  using (auth.uid() = dono);

drop policy if exists "dono insere seus registros" on public.registros;
create policy "dono insere seus registros"
  on public.registros for insert to authenticated
  with check (auth.uid() = dono);

-- (sem policy de UPDATE e sem policy de DELETE — de propósito)

-- Comprovantes: bucket privado; cada pessoa só enxerga a própria pasta (uid/...)
insert into storage.buckets (id, name, public)
  values ('comprovantes', 'comprovantes', false)
  on conflict (id) do nothing;

drop policy if exists "dono envia comprovante" on storage.objects;
create policy "dono envia comprovante"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "dono le comprovante" on storage.objects;
create policy "dono le comprovante"
  on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);

-- (sem policy de UPDATE e sem policy de DELETE no storage — o arquivo é imutável;
--  a chave é o próprio SHA-256, então o mesmo arquivo nunca sobe duas vezes)

-- Se você rodou uma versão anterior deste arquivo (sem o tipo 'filho'), rode
-- também as duas linhas abaixo — elas trocam a regra de tipos permitidos:
alter table public.registros drop constraint if exists registros_tipo_check;
alter table public.registros add constraint registros_tipo_check check (tipo in ('despesa', 'pagamento', 'combinado', 'filho'));
