// Túnel HTTPS para o Mac ficar alcançável pela Meta sem abrir porta no roteador.
//
// Dois modos:
//   • PUBLIC_URL definida  → você já tem uma URL fixa (ngrok, Tailscale Funnel,
//     domínio próprio). Não sobe nada, só usa.
//   • sem PUBLIC_URL       → sobe `cloudflared tunnel --url` e lê o endereço da
//     saída. Não exige conta em lugar nenhum, mas o endereço MUDA a cada
//     reinício — por isso o daemon registra o webhook de novo a cada mudança.
//
// O processo do túnel é filho do daemon: cai o túnel, ele volta; para o daemon,
// o túnel morre junto. Sem serviço órfão rodando pela máquina.

import { spawn, type ChildProcess } from "node:child_process";

/**
 * Extrai a URL pública da saída do cloudflared. Ele imprime a URL no meio de um
 * banner ASCII, em stderr, e o formato do banner já mudou entre versões —
 * então procuramos o padrão do domínio, não a posição na linha.
 */
export function extrairUrlCloudflared(texto: string): string | null {
  const m = texto.match(/https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

export interface OpcoesTunel {
  porta: number;
  urlFixa?: string;
  binario?: string;
  /** Chamado a cada vez que a URL pública muda (inclusive na primeira). */
  aoMudarUrl: (url: string) => void | Promise<void>;
  log?: (...args: unknown[]) => void;
}

export interface Tunel {
  parar(): void;
  urlAtual(): string | null;
}

export function iniciarTunel(opts: OpcoesTunel): Tunel {
  const log = opts.log || console.log;
  let url: string | null = null;
  let proc: ChildProcess | null = null;
  let parado = false;
  let tentativas = 0;

  if (opts.urlFixa) {
    url = opts.urlFixa.replace(/\/+$/, "");
    log(`túnel: usando PUBLIC_URL fixa (${url})`);
    void opts.aoMudarUrl(url);
    return { parar() {}, urlAtual: () => url };
  }

  function subir() {
    if (parado) return;
    const bin = opts.binario || "cloudflared";
    proc = spawn(bin, ["tunnel", "--url", `http://127.0.0.1:${opts.porta}`, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const ler = (chunk: Buffer | string) => {
      const texto = chunk.toString();
      const achada = extrairUrlCloudflared(texto);
      if (achada && achada !== url) {
        url = achada;
        tentativas = 0;
        log(`túnel: ${url}`);
        void opts.aoMudarUrl(url);
      }
    };
    proc.stdout?.on("data", ler);
    proc.stderr?.on("data", ler); // o cloudflared imprime a URL em stderr

    proc.on("error", (e: any) => {
      if (e?.code === "ENOENT") {
        log(
          `túnel: '${bin}' não encontrado. Instale com 'brew install cloudflared' ` +
            `ou defina PUBLIC_URL no .env.`,
        );
        return; // sem binário, insistir não adianta
      }
      log("túnel: erro —", e?.message || e);
    });

    proc.on("exit", (code) => {
      proc = null;
      url = null;
      if (parado) return;
      // Backoff até 60s: túnel gratuito cai de vez em quando, e martelar piora.
      const espera = Math.min(60_000, 2000 * 2 ** Math.min(tentativas++, 5));
      log(`túnel: caiu (código ${code}), reabrindo em ${Math.round(espera / 1000)}s`);
      setTimeout(subir, espera);
    });
  }

  subir();

  return {
    parar() {
      parado = true;
      proc?.kill("SIGTERM");
    },
    urlAtual: () => url,
  };
}
