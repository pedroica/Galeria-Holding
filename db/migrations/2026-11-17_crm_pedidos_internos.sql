-- Fase 2, item 7: rascunhos internos (pedidos de case às agências). O sistema não
-- envia: a tela SDR abre no Outlook (mailto) e o Pedro envia. Aditiva.
create table if not exists public.crm_pedidos_internos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'pedido_case',
  agencia_slug text, destinatario_nome text, destinatario_email text,
  assunto text not null, corpo text not null,
  status text not null default 'rascunho',
  criado_em timestamptz not null default now(), enviado_em timestamptz,
  unique (tipo, agencia_slug)
);
alter table public.crm_pedidos_internos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='crm_pedidos_internos' and policyname='autenticado_tudo') then
    create policy autenticado_tudo on public.crm_pedidos_internos for all to authenticated using (true) with check (true);
  end if;
end $$;
