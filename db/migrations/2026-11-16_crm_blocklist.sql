-- 2026-11-16 · crm_blocklist — blocklist de prospecção (clientes da holding)
-- Aplicada em produção (uetltlnjmobeiunxfsqi) via Supabase MCP.
-- Enforcement server-side: api/fila.js + lib/blocklist.js. Clientes ativos
-- (crm_empresas.cliente_ativo) são bloqueados automaticamente além desta lista.

create table if not exists public.crm_blocklist (
  id              uuid primary key default gen_random_uuid(),
  nome_canonico   text not null,
  aliases         text[] not null default '{}',
  dominios        text[] not null default '{}',
  grupo_economico text,
  motivo          text,
  ativo           boolean not null default true,
  origem          text not null default 'manual',   -- 'seed' | 'manual'
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  apagado_em      timestamptz
);
create index if not exists crm_blocklist_nome_idx on public.crm_blocklist (lower(nome_canonico));
create index if not exists crm_blocklist_dominios_idx on public.crm_blocklist using gin (dominios);

alter table public.crm_blocklist enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='crm_blocklist' and policyname='autenticado_tudo') then
    create policy autenticado_tudo on public.crm_blocklist for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Seed dos clientes atuais da holding (gerenciável pela aba Blocklist do CRM).
insert into public.crm_blocklist (nome_canonico, aliases, dominios, grupo_economico, motivo, origem) values
 ('Google', ARRAY['google','alphabet','youtube','waze'], ARRAY['google.com','google.com.br','abc.xyz','youtube.com'], 'Alphabet', 'Cliente da holding', 'seed'),
 ('Itaú', ARRAY['itau','itau unibanco','banco itau','itau bba','itaucard'], ARRAY['itau.com.br','itau-unibanco.com.br','itaubba.com'], 'Itaú Unibanco', 'Cliente da holding', 'seed'),
 ('McDonald''s', ARRAY['mcdonald','mcdonalds','mcdonald s','mc donalds','arcos dorados'], ARRAY['mcdonalds.com','mcdonalds.com.br','arcosdorados.com'], 'Arcos Dorados', 'Cliente da holding', 'seed'),
 ('Flutter', ARRAY['flutter','betnacional','betfair','sportingbet','pokerstars'], ARRAY['flutter.com','betnacional.com','betfair.com','sportingbet.com'], 'Flutter Entertainment', 'Cliente da holding', 'seed'),
 ('Havaianas', ARRAY['havaianas','alpargatas','dupe','osklen'], ARRAY['havaianas.com','havaianas.com.br','alpargatas.com.br'], 'Alpargatas', 'Cliente da holding', 'seed'),
 ('Bauducco', ARRAY['bauducco','pandurata','visconti'], ARRAY['bauducco.com.br','pandurata.com.br'], 'Pandurata', 'Cliente da holding', 'seed'),
 ('Italac', ARRAY['italac','laticinios bela vista','goias verde'], ARRAY['italac.com.br'], 'Laticínios Bela Vista', 'Cliente da holding', 'seed'),
 ('3 Corações', ARRAY['3 coracoes','tres coracoes','cafe 3 coracoes'], ARRAY['3coracoes.com.br','trescoracoes.com.br'], 'Grupo 3 Corações', 'Cliente da holding', 'seed'),
 ('Track & Field', ARRAY['track field','track and field','tf sports'], ARRAY['trackfield.com.br','tfsports.com.br'], 'Track & Field', 'Cliente da holding', 'seed'),
 ('Hinode / Magá', ARRAY['hinode','grupo hinode','maga'], ARRAY['hinode.com.br','grupohinode.com.br'], 'Grupo Hinode', 'Cliente da holding', 'seed'),
 ('Domino''s', ARRAY['dominos','dominos pizza'], ARRAY['dominos.com.br','dominospizza.com.br'], 'Domino''s', 'Cliente da holding', 'seed'),
 ('Stellantis / Peugeot', ARRAY['stellantis','peugeot','fiat','jeep','citroen','ram','dodge'], ARRAY['stellantis.com','peugeot.com.br','fiat.com.br','jeep.com.br','citroen.com.br'], 'Stellantis', 'Cliente da holding', 'seed'),
 ('Natura', ARRAY['natura','natura co','avon','the body shop','aesop'], ARRAY['natura.com.br','naturaeco.com','avon.com.br'], 'Natura & Co', 'Cliente da holding', 'seed'),
 ('99', ARRAY['99','99 tecnologia','99app','99 pop','didi'], ARRAY['99app.com','99taxis.com','didiglobal.com'], 'DiDi', 'Cliente da holding', 'seed'),
 ('Vivara', ARRAY['vivara','life by vivara'], ARRAY['vivara.com.br'], 'Vivara', 'Cliente da holding', 'seed'),
 ('Reckitt', ARRAY['reckitt','reckitt benckiser','vanish','veet','durex','lysol','sbp','gaviscon'], ARRAY['reckitt.com','rb.com'], 'Reckitt', 'Cliente da holding', 'seed')
on conflict do nothing;
