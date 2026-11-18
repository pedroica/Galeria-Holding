-- E-mails abertos pela Fila: onde abrir (Gmail no navegador) e cópia para o e-mail
-- da Galeria (Cco, o destinatário não vê). Aplicada em produção 2026-11-18.
-- Reverter: delete das 3 chaves volta ao padrão (Outlook Web, sem cópia).
INSERT INTO crm_configuracoes (chave, valor) VALUES
  ('email_copia',      '"pedro.ica@galeriaholding.co"'::jsonb),
  ('email_copia_tipo', '"bcc"'::jsonb),
  ('email_abrir_em',   '"gmail"'::jsonb)
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
