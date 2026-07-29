/**
 * vozz/piper — motor neural Piper (VITS) executado no navegador.
 */

import type { Audio, DivisorDeTexto } from "./index.js";

export interface ProgressoPiper {
  /** `baixando` | `cache` | `iniciando` | `pronto` */
  status: string;
  /** 0 a 1. */
  progresso: number;
  recebido: number;
  total: number;
  arquivo?: string;
}

export interface OpcoesCarregarPiper {
  /** Base das URLs do modelo. Padrão: jsDelivr sobre o repositório. */
  cdn?: string;
  /** URL completa do `.onnx` (sobrescreve `cdn`). */
  urlModelo?: string;
  /** URL completa do `.json` de configuração. */
  urlConfig?: string;
  /** Backend de inferência. `auto` usa WebGPU se houver. */
  dispositivo?: "auto" | "webgpu" | "wasm";
  /** Callback de progresso do download. */
  aoProgredir?: (p: ProgressoPiper) => void;
  /** Guardar o modelo no cache do navegador. Padrão: true. */
  cache?: boolean;
}

export interface OpcoesFalarPiper {
  /** Velocidade da fala. 1 = normal, 2 = duas vezes mais rápido. */
  velocidade?: number;
  /** Variabilidade da entonação (`noise_scale`). Padrão: 0.667. */
  ruido?: number;
  /** Variabilidade da duração dos fonemas (`noise_w`). Padrão: 0.8. */
  ruidoW?: number;
  /** Pronúncias customizadas: `{ palavra: "IPA" }`. */
  lexico?: Record<string, string>;
}

export interface TrechoPiper {
  texto: string;
  fonemas: string;
  audio: Audio;
}

export declare class Piper {
  /** Baixa o modelo (uma vez) e inicializa a sessão de inferência. */
  static carregar(opcoes?: OpcoesCarregarPiper): Promise<Piper>;
  /** Texto → IPA, sem sintetizar. */
  static fonemizar(texto: string, opcoes?: { normalizar?: boolean; lexico?: Record<string, string> }): string;
  /** Remove o modelo do cache do navegador. */
  static limparCache(): Promise<boolean>;

  /** Backend em uso: `webgpu` ou `wasm`. */
  readonly dispositivo: string;
  /** Taxa de amostragem do modelo (22050 Hz). */
  readonly taxa: number;

  /** Converte IPA nos ids de entrada do modelo. */
  idsDeFonemas(ipa: string): number[];
  /** Sintetiza uma cadeia IPA. */
  sintetizarIPA(ipa: string, opcoes?: OpcoesFalarPiper): Promise<Audio>;
  /** Sintetiza texto em português. */
  falar(texto: string, opcoes?: OpcoesFalarPiper): Promise<Audio>;
  /** Sintetiza em fluxo, entregando cada sentença assim que fica pronta. */
  falarEmFluxo(entrada: string | DivisorDeTexto, opcoes?: OpcoesFalarPiper): AsyncGenerator<TrechoPiper>;
  /** Libera a sessão de inferência. */
  liberar(): Promise<void>;
}

export declare const CDN_PADRAO: string;
export default Piper;
