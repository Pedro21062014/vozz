/**
 * vozz — TTS ultrarrealista em português do Brasil, 100% offline no navegador.
 */

export type NomeVoz = "dora" | "alex" | "santa" | (string & {});
export type Dispositivo = "auto" | "webgpu" | "wasm" | "cpu";
export type Precisao = "q8" | "fp32" | "fp16" | "q4";

export interface Voz {
  /** Identificador interno (nome do arquivo de embedding). */
  id: string;
  /** Nome amigável. */
  nome: string;
  genero: "feminina" | "masculina";
  idioma: string;
  descricao: string;
}

export interface ProgressoCarregamento {
  status: string;
  progresso?: number;
  arquivo?: string;
}

export interface OpcoesCarregar {
  /** Backend de inferência. `auto` usa WebGPU se houver, senão WASM. */
  dispositivo?: Dispositivo;
  /** Quantização dos pesos. Padrão: `q8` (~86 MB) ou `fp32` no WebGPU. */
  precisao?: Precisao;
  /** Callback de progresso do download dos pesos. */
  aoProgredir?: (p: ProgressoCarregamento) => void;
  /** Repositório alternativo dos pesos no Hugging Face. */
  repo?: string;
}

export interface OpcoesFalar {
  /** Voz a usar. Padrão: `"dora"`. */
  voz?: NomeVoz;
  /** Velocidade da fala, de 0.5 a 2. Padrão: 1. */
  velocidade?: number;
  /** Pronúncias customizadas: `{ "kubernetes": "kubeɾnˈetʃis" }`. */
  lexico?: Record<string, string>;
  /** Expandir números, datas, moedas e siglas. Padrão: true. */
  normalizar?: boolean;
}

export interface TrechoFalado {
  texto: string;
  fonemas: string;
  audio: Audio;
}

/** Áudio sintetizado (PCM mono 24 kHz). */
export declare class Audio {
  constructor(amostras: Float32Array, taxa?: number);
  readonly amostras: Float32Array;
  readonly taxa: number;
  /** Duração em segundos. */
  readonly duracao: number;
  /** Serializa como WAV PCM 16-bit. */
  paraWav(): ArrayBuffer;
  /** Blob `audio/wav` (navegador). */
  paraBlob(): Blob;
  /** Object URL pronta para `<audio src>`. */
  paraURL(): string;
  /** Toca no navegador; resolve ao terminar. */
  tocar(): Promise<void>;
  /** Interrompe a reprodução. */
  parar(): void;
  /** Salva em disco (Node) ou baixa (navegador). */
  salvar(caminho?: string): Promise<void>;
  /** Concatena trechos com pausa opcional em segundos. */
  static concatenar(lista: Audio[], pausaSegundos?: number): Audio;
}

/** Divisor incremental de sentenças, para fluxo vindo de um LLM. */
export declare class DivisorDeTexto implements AsyncIterable<string> {
  empurrar(...pedacos: string[]): this;
  /** Emite o texto restante sem esperar pontuação. */
  descarregar(): this;
  fechar(): this;
  [Symbol.asyncIterator](): AsyncIterator<string>;
}

export declare class Vozz {
  /** Baixa (uma vez) e inicializa o modelo neural. */
  static carregar(opcoes?: OpcoesCarregar): Promise<Vozz>;
  /** Lista as vozes disponíveis. */
  static vozes(): Voz[];
  /** Converte texto em IPA sem sintetizar (útil para depurar pronúncia). */
  static fonemizar(texto: string, opcoes?: { normalizar?: boolean; lexico?: Record<string, string> }): string;

  readonly dispositivo: Dispositivo;
  readonly precisao: Precisao;

  /** Sintetiza o texto inteiro. */
  falar(texto: string, opcoes?: OpcoesFalar): Promise<Audio>;
  /** Sintetiza em fluxo, devolvendo cada sentença assim que fica pronta. */
  falarEmFluxo(
    entrada: string | DivisorDeTexto,
    opcoes?: OpcoesFalar,
  ): AsyncGenerator<TrechoFalado>;
}

/** Atalho: carrega o modelo na 1ª chamada e reaproveita depois. */
export declare function falar(texto: string, opcoes?: OpcoesFalar & OpcoesCarregar): Promise<Audio>;
/** Pré-carrega o modelo (ex.: durante um splash screen). */
export declare function preAquecer(opcoes?: OpcoesCarregar): Promise<Vozz>;

export declare function dividirEmSentencas(texto: string): string[];
export declare function codificarWav(amostras: Float32Array, taxa?: number): ArrayBuffer;
export declare function fonemizar(
  texto: string,
  opcoes?: { normalizar?: boolean; lexico?: Record<string, string> },
): string;
export declare function normalizar(texto: string, opcoes?: { expandirNumeros?: boolean; expandirSiglas?: boolean }): string;
export declare function listarVozes(): Voz[];
export declare function resolverVoz(nome: string): Voz;
export declare const VOZES: Readonly<Record<string, Voz>>;

export default Vozz;
