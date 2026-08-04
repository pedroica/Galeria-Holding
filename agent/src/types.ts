// Tipos compartilhados do Agente Outbound Galeria.

export interface BlocklistEntry {
  id: string;
  canonicalName: string;
  aliases: string[];
  domains: string[];
  economicGroup?: string;
  note?: string;
  active?: boolean;
}

// Entrada a checar contra a blocklist: empresa e/ou contato.
export interface BlockCheckInput {
  name?: string; // nome da empresa
  domain?: string; // domínio corporativo (site ou do email)
  email?: string; // email do contato (extraímos o domínio)
}

export type BlockReason = "domain" | "name" | "economic_group";

export interface BlockResult {
  blocked: boolean;
  entryId?: string;
  entryName?: string; // canonicalName da entrada que bloqueou
  reason?: BlockReason;
  matched?: string; // token/domínio exato que casou
}

export interface Company {
  crmKey?: string;
  rank?: number;
  name: string;
  segmento?: string;
  domain?: string;
}
