/**
 * vozz/sintetizador — TTS por síntese de formantes, 100% em código.
 * Sem rede neural, sem download de pesos, sem dependências.
 */

import type { Audio } from "./index.js";

export type NomeVozCodigo = "clara" | "bruno" | "grave" | (string & {});

export interface VozCodigo {
  nome: string;
  genero: "feminina" | "masculina";
  /** Frequência fundamental base, em Hz. */
  f0: number;
  /** Escala dos formantes (proporcional ao comprimento do trato vocal). */
  escalaFormante: number;
  /** Assimetria do pulso glotal: mais alto = voz mais projetada. */
  tenso: number;
  descricao: string;
}

export interface OpcoesSintetizador {
  /** Voz. Padrão: `"clara"`. */
  voz?: NomeVozCodigo;
  /** Velocidade da fala (0.5 a 2). Padrão: 1. */
  velocidade?: number;
  /** Frequência fundamental em Hz; sobrescreve a da voz. */
  f0?: number;
  /** Intensidade da curva melódica (0 = monótono, 1 = normal, 2 = expressivo). */
  entonacao?: number;
  /** Taxa de amostragem. Padrão: 24000. */
  taxa?: number;
  /** Pronúncias customizadas: `{ palavra: "IPA" }`. */
  lexico?: Record<string, string>;
}

/**
 * Motor de síntese por formantes.
 *
 * Calcula o áudio amostra a amostra com um modelo fonte-filtro (pregas
 * vocais + ressoadores do trato vocal). Roda em qualquer runtime JS,
 * inclusive Cloudflare Workers e outros ambientes de edge.
 */
export declare class Sintetizador {
  constructor(opcoes?: OpcoesSintetizador);
  /** Lista as vozes deste motor. */
  static vozes(): Array<VozCodigo & { id: string }>;
  /** Texto → IPA, sem sintetizar. */
  static fonemizar(texto: string, opcoes?: { normalizar?: boolean; lexico?: Record<string, string> }): string;
  /** Sintetiza texto em português. Síncrono: não há I/O. */
  falar(texto: string, opcoes?: OpcoesSintetizador): Audio;
  /** Sintetiza direto de uma cadeia IPA (pula o G2P). */
  falarIPA(ipa: string, opcoes?: OpcoesSintetizador): Audio;
}

/** Sintetiza uma cadeia IPA com controle total dos parâmetros. */
export declare function sintetizarIPA(
  ipa: string,
  opcoes: {
    vozConfig: VozCodigo;
    velocidade?: number;
    entonacao?: number;
    f0?: number;
    taxa?: number;
  },
): Audio;

export declare const VOZES_CODIGO: Readonly<Record<string, VozCodigo>>;

export { Audio } from "./index.js";
export default Sintetizador;
