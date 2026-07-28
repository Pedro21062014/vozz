/**
 * vozz — TTS ultrarrealista em português do Brasil, 100% offline.
 *
 *   import { Vozz } from "vozz";
 *
 *   const tts = await Vozz.carregar();
 *   const audio = await tts.falar("Olá! Tudo bem com você?");
 *   audio.tocar();
 *
 * Nada de API key, servidor ou custo por caractere: o modelo neural (82M
 * parâmetros, ~86 MB em int8) roda no próprio dispositivo, com WebGPU quando
 * disponível e WASM como alternativa.
 */

import { fonemizar } from "./g2p/index.js";
import { Audio, TAXA_PADRAO } from "./audio.js";
import { VOZES, REPO_PADRAO, resolverVoz, listarVozes, urlVoz } from "./voices.js";
import { dividirEmSentencas, DivisorDeTexto } from "./splitter.js";

/** Limite de tokens do modelo (com folga para os paddings). */
const MAX_TOKENS = 510;

/** Cache de embeddings de voz entre instâncias. */
const cacheVozes = new Map();

/**
 * @typedef {Object} OpcoesCarregar
 * @property {'auto'|'webgpu'|'wasm'|'cpu'} [dispositivo='auto'] onde rodar a inferência
 * @property {'q8'|'fp32'|'fp16'|'q4'} [precisao] padrão: 'q8' (leve) ou 'fp32' no WebGPU
 * @property {(p:{status:string,progresso?:number,arquivo?:string})=>void} [aoProgredir]
 * @property {string} [repo] repositório dos pesos no Hugging Face
 */

/**
 * @typedef {Object} OpcoesFalar
 * @property {keyof typeof VOZES|string} [voz='dora']
 * @property {number} [velocidade=1] 0.5 (lento) a 2 (rápido)
 * @property {Record<string,string>} [lexico] pronúncias customizadas {palavra: IPA}
 * @property {boolean} [normalizar=true] expandir números, datas, siglas...
 */

export class Vozz {
  /** @private */
  constructor(modelo, tokenizador, opcoes) {
    this.modelo = modelo;
    this.tokenizador = tokenizador;
    this.repo = opcoes.repo;
    this.dispositivo = opcoes.dispositivo;
    this.precisao = opcoes.precisao;
  }

  /**
   * Baixa (uma vez) e inicializa o modelo.
   * @param {OpcoesCarregar} [opcoes]
   * @returns {Promise<Vozz>}
   */
  static async carregar(opcoes = {}) {
    const {
      dispositivo = "auto",
      aoProgredir = null,
      repo = REPO_PADRAO,
    } = opcoes;

    const alvo = await escolherDispositivo(dispositivo);
    const precisao = opcoes.precisao ?? (alvo === "webgpu" ? "fp32" : "q8");

    const { StyleTextToSpeech2Model, AutoTokenizer } = await import("@huggingface/transformers");

    const progresso = aoProgredir
      ? (p) => {
          aoProgredir({
            status: p.status,
            arquivo: p.file,
            progresso: typeof p.progress === "number" ? p.progress / 100 : undefined,
          });
        }
      : undefined;

    const [modelo, tokenizador] = await Promise.all([
      StyleTextToSpeech2Model.from_pretrained(repo, {
        dtype: precisao,
        device: alvo,
        progress_callback: progresso,
      }),
      AutoTokenizer.from_pretrained(repo, { progress_callback: progresso }),
    ]);

    return new Vozz(modelo, tokenizador, { repo, dispositivo: alvo, precisao });
  }

  /** Lista as vozes disponíveis. */
  static vozes() {
    return listarVozes();
  }

  /** Converte texto em IPA sem sintetizar (útil para depurar pronúncia). */
  static fonemizar(texto, opcoes) {
    return fonemizar(texto, opcoes);
  }

  /**
   * Sintetiza um texto inteiro.
   * @param {string} texto
   * @param {OpcoesFalar} [opcoes]
   * @returns {Promise<Audio>}
   */
  async falar(texto, opcoes = {}) {
    const trechos = [];
    for await (const parte of this.falarEmFluxo(texto, opcoes)) {
      trechos.push(parte.audio);
    }
    if (!trechos.length) return new Audio(new Float32Array(0), TAXA_PADRAO);
    return Audio.concatenar(trechos, 0.06);
  }

  /**
   * Sintetiza em fluxo: devolve cada sentença assim que fica pronta.
   * Ideal para começar a tocar sem esperar o texto inteiro.
   *
   * @param {string|DivisorDeTexto} entrada
   * @param {OpcoesFalar} [opcoes]
   * @returns {AsyncGenerator<{texto:string, fonemas:string, audio:Audio}>}
   */
  async *falarEmFluxo(entrada, opcoes = {}) {
    const {
      voz = "dora",
      velocidade = 1,
      lexico = null,
      normalizar = true,
    } = opcoes;

    const infoVoz = resolverVoz(voz);
    const embedding = await this._carregarVoz(infoVoz.id);

    const fonte =
      entrada instanceof DivisorDeTexto
        ? entrada
        : (function* () {
            for (const s of dividirEmSentencas(String(entrada ?? ""))) yield s;
          })();

    for await (const sentenca of fonte) {
      const limpa = String(sentenca).trim();
      if (!limpa) continue;

      const fonemas = fonemizar(limpa, { normalizar, lexico });
      if (!fonemas) continue;

      for (const bloco of this._quebrarPorTokens(fonemas)) {
        const audio = await this._sintetizar(bloco, embedding, velocidade);
        yield { texto: limpa, fonemas: bloco, audio };
      }
    }
  }

  /** @private Executa o modelo para uma cadeia de fonemas. */
  async _sintetizar(fonemas, embedding, velocidade) {
    const { Tensor } = await import("@huggingface/transformers");
    const { input_ids } = this.tokenizador(fonemas, { truncation: true });

    const n = input_ids.dims.at(-1);
    const desloc = 256 * Math.min(Math.max(n - 2, 0), 509);
    const estilo = embedding.slice(desloc, desloc + 256);

    const { waveform } = await this.modelo({
      input_ids,
      style: new Tensor("float32", estilo, [1, 256]),
      speed: new Tensor("float32", [velocidade], [1]),
    });

    return new Audio(waveform.data, TAXA_PADRAO);
  }

  /** @private Divide cadeias longas de fonemas respeitando o limite do modelo. */
  *_quebrarPorTokens(fonemas) {
    if (fonemas.length <= MAX_TOKENS - 2) {
      yield fonemas;
      return;
    }
    // Quebra em pontuação interna; se não houver, em espaços.
    const pedacos = fonemas.split(/(?<=[,;:])\s+/);
    let atual = "";
    for (const p of pedacos) {
      const candidato = atual ? `${atual} ${p}` : p;
      if (candidato.length > MAX_TOKENS - 2 && atual) {
        yield atual;
        atual = p;
      } else {
        atual = candidato;
      }
    }
    // Último recurso: fatia dura por palavras.
    while (atual.length > MAX_TOKENS - 2) {
      let corte = atual.lastIndexOf(" ", MAX_TOKENS - 2);
      if (corte <= 0) corte = MAX_TOKENS - 2;
      yield atual.slice(0, corte);
      atual = atual.slice(corte).trim();
    }
    if (atual) yield atual;
  }

  /** @private Baixa e memoriza o embedding da voz. */
  async _carregarVoz(idVoz) {
    if (cacheVozes.has(idVoz)) return cacheVozes.get(idVoz);

    const url = urlVoz(idVoz, this.repo);
    let dados;

    // No navegador aproveitamos a Cache API para não rebaixar a cada visita.
    if (typeof caches !== "undefined") {
      try {
        const cache = await caches.open("vozz-vozes");
        const hit = await cache.match(url);
        if (hit) {
          dados = await hit.arrayBuffer();
        } else {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          dados = await resp.arrayBuffer();
          try {
            await cache.put(url, new Response(dados, { headers: resp.headers }));
          } catch { /* cota cheia: segue sem cachear */ }
        }
      } catch {
        dados = await (await fetch(url)).arrayBuffer();
      }
    } else {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`[vozz] Falha ao baixar a voz "${idVoz}": HTTP ${resp.status}`);
      }
      dados = await resp.arrayBuffer();
    }

    const embedding = new Float32Array(dados);
    cacheVozes.set(idVoz, embedding);
    return embedding;
  }
}

/** Detecta o melhor backend disponível. */
async function escolherDispositivo(preferencia) {
  if (preferencia && preferencia !== "auto") return preferencia;
  const temNavegador = typeof navigator !== "undefined";
  if (temNavegador && "gpu" in navigator) {
    try {
      const adaptador = await navigator.gpu.requestAdapter();
      if (adaptador) return "webgpu";
    } catch { /* sem WebGPU */ }
  }
  return temNavegador ? "wasm" : "cpu";
}

/* ---------------------------------------------------------------- *
 * Atalho de uma linha
 * ---------------------------------------------------------------- */

let instanciaPadrao = null;

/**
 * Sintetiza sem gerenciar instância — carrega o modelo na 1ª chamada e reusa.
 *
 *   import { falar } from "vozz";
 *   (await falar("Olá, mundo!")).tocar();
 *
 * @param {string} texto
 * @param {OpcoesFalar & OpcoesCarregar} [opcoes]
 * @returns {Promise<Audio>}
 */
export async function falar(texto, opcoes = {}) {
  if (!instanciaPadrao) {
    instanciaPadrao = await Vozz.carregar(opcoes);
  }
  return instanciaPadrao.falar(texto, opcoes);
}

/** Pré-carrega o modelo (ex.: durante um splash screen). */
export async function preAquecer(opcoes = {}) {
  if (!instanciaPadrao) instanciaPadrao = await Vozz.carregar(opcoes);
  return instanciaPadrao;
}

export { Audio, codificarWav } from "./audio.js";
export { VOZES, listarVozes, resolverVoz } from "./voices.js";
export { fonemizar, normalizar } from "./g2p/index.js";
export { DivisorDeTexto, dividirEmSentencas } from "./splitter.js";
export default Vozz;
