-- Fase 2, item 1: o servidor valida o Bearer do relógio contra o segredo do
-- Vault sem depender de env na Vercel. A função compara DENTRO do banco e só
-- devolve true/false: o segredo nunca sai do Vault. Só o service_role executa.
-- Reverter: drop function if exists public.sdr_cron_token_valido(text);
create or replace function public.sdr_cron_token_valido(token text)
returns boolean
language plpgsql
security definer
set search_path = public, vault
as $$
declare segredo text;
begin
  if token is null or length(token) < 16 then return false; end if;
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'sdr_cron_secret' limit 1;
  return segredo is not null and segredo = token;
end $$;
revoke all on function public.sdr_cron_token_valido(text) from public, anon, authenticated;
grant execute on function public.sdr_cron_token_valido(text) to service_role;
