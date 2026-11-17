-- 2026-11-16 · REVOKE EXECUTE das funções de escrita em massa
-- Pedro revogou EXECUTE direto no banco em 2026-11-16; registrado aqui para
-- rastreabilidade. Idempotente. Apenas service_role (server-side) mantém acesso.
-- ACL verificada em produção: {postgres=X/postgres, service_role=X/postgres}.

revoke execute on function public.crm_bulk_insert(text, jsonb) from public, anon, authenticated;
revoke execute on function public.crm_bulk_update_raw(jsonb) from public, anon, authenticated;
grant  execute on function public.crm_bulk_insert(text, jsonb) to service_role;
grant  execute on function public.crm_bulk_update_raw(jsonb) to service_role;
