-- Bloco D (SDR): botão de pânico + agenda de envio. Aditiva e reversível:
--   reverter: select cron.unschedule('sdr-agendar'); select cron.unschedule('sdr-envio');
--             drop function if exists public.sdr_pausar_tudo(text);
-- "Pausar tudo" (tela) e "pausar" (WhatsApp do copiloto) chamam esta função:
-- desliga o Piloto na hora e devolve para rascunho tudo o que estava agendado e
-- ainda não saiu. Não apaga nada.
create or replace function public.sdr_pausar_tudo(origem text default 'tela')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare n_estado int; n_fila int;
begin
  update crm_configuracoes set valor = 'false'::jsonb where chave = 'sdr_piloto_automatico';
  with e as (
    update crm_sdr_estado set etapa = 'rascunho', agendado_para = null,
           motivo = 'pausado (' || coalesce(origem,'?') || ') em ' || now()::text, atualizado_em = now()
     where etapa = 'agendado' and status = 'ativo'
     returning fila_id)
  , f as (
    update crm_fila set status = 'rascunho', aprovado_em = null
     where status = 'aprovado' and id in (select fila_id from e where fila_id is not null)
     returning id)
  select (select count(*) from e), (select count(*) from f) into n_estado, n_fila;
  insert into crm_logs (origem, nivel, mensagem, contexto)
  values ('sdr-panico', 'aviso', 'PAUSAR TUDO acionado', jsonb_build_object('origem', origem, 'agendados_cancelados', n_estado, 'fila_revertida', n_fila));
  return jsonb_build_object('ok', true, 'piloto', false, 'agendados_cancelados', n_estado, 'fila_revertida', n_fila);
end $$;
revoke all on function public.sdr_pausar_tudo(text) from public, anon;
grant execute on function public.sdr_pausar_tudo(text) to authenticated, service_role;

insert into public.crm_configuracoes (chave, valor) values
  ('sdr_wa_template', 'null'::jsonb),
  ('sdr_aquecimento_desde', 'null'::jsonb)
on conflict (chave) do nothing;

-- 07:00 BRT agenda; envio a cada 5 min entre 07:00 e 10:59 BRT, dias úteis.
-- Dormentes enquanto sdr_relogio_ativo=false; e mesmo com o relógio ligado,
-- nada sai com sdr_piloto_automatico=false.
select cron.schedule('sdr-agendar', '0 10 * * 1-5',    $$select public.sdr_tick('sdr-agendar', 0)$$);
select cron.schedule('sdr-envio',   '*/5 10-13 * * 1-5', $$select public.sdr_tick('sdr-envio', 3)$$);
