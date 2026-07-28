/**
 * vozz/g2p — conversor grafema→fonema pt-BR em JS puro (sem WASM, sem rede).
 */

export interface OpcoesFonemizar {
  /** Expandir números, datas, moedas, siglas. Padrão: true. */
  normalizar?: boolean;
  /** Pronúncias customizadas: `{ palavra: "IPA" }`. */
  lexico?: Record<string, string>;
}

export interface Silaba {
  onset: string[];
  nucleo: string[];
  coda: string[];
  tonica?: boolean;
  secundaria?: boolean;
}

/** Converte texto pt-BR em IPA (convenção espeak-ng `pt-br`). */
export declare function fonemizar(texto: string, opcoes?: OpcoesFonemizar): string;
/** Alias em inglês de `fonemizar`. */
export declare function phonemize(texto: string, opcoes?: OpcoesFonemizar): string;
/** Normaliza números, datas, moedas, siglas e símbolos para palavras. */
export declare function normalizar(
  texto: string,
  opcoes?: { expandirNumeros?: boolean; expandirSiglas?: boolean },
): string;
/** Divide uma palavra em sílabas (ataque–núcleo–coda). */
export declare function silabificar(palavra: string): Silaba[];
/** Marca a sílaba tônica e devolve o índice dela. */
export declare function acentuar(silabas: Silaba[], palavra: string): number;
/** Converte uma única palavra em IPA. */
export declare function palavraParaIPA(
  palavra: string,
  ctx?: { proximaInicial?: string },
): string;

export declare const LEXICO: Map<string, string>;
export declare const CLITICOS: Map<string, string>;
