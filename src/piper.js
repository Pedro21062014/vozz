/**
 * vozz/piper — motor neural Piper (VITS) rodando no navegador.
 *
 * Modelo quantizado em int8 (~18,7 MB), baixado sob demanda de um CDN e
 * mantido no cache do navegador. A síntese acontece no dispositivo do
 * usuário via onnxruntime-web (WebGPU quando disponível, WASM como
 * alternativa) — nada de servidor, API key ou custo por caractere.
 *
 * Compatível com hospedagem estática: Cloudflare Pages, Vercel, Netlify,
 * GitHub Pages. Basta servir os arquivos; não há backend.
 */

import { fonemizar } from "./g2p/index.js";
import { Audio } from "./audio.js";
import { dividirEmSentencas, DivisorDeTexto } from "./splitter.js";

/** CDN padrão: jsDelivr sobre o repositório do modelo (CORS liberado). */
export const CDN_PADRAO = "https://cdn.jsdelivr.net/gh/Pedro21062014/vozz@main";
const ARQ_MODELO = "pt_BR-faber-medium-quantized.onnx";
const ARQ_CONFIG = "pt_BR-faber-medium-quantized.onnx.json";

/** Nome do cache do navegador (Cache API). */
const CACHE = "vozz-piper-v1";

/**
 * @typedef {Object} OpcoesCarregar
 * @property {string} [cdn] base das URLs do modelo
 * @property {string} [urlModelo] URL completa do .onnx (sobrescreve `cdn`)
 * @property {string} [urlConfig] URL completa do .json
 * @property {'auto'|'webgpu'|'wasm'} [dispositivo='auto']
 * @property {(p:{status:string,progresso:number,recebido:number,total:number})=>void} [aoProgredir]
 * @property {boolean} [cache=true] guardar o modelo no cache do navegador
 */

/**
 * Baixa um arquivo relatando progresso, usando o cache quando disponível.
 * @returns {Promise<ArrayBuffer>}
 */
async function baixar(url, { aoProgredir, usarCache = true, rotulo = "" } = {}) {
  // Cache API só existe em navegador/worker; em Node cai direto no fetch.
  let cache = null;
  if (usarCache && typeof caches !== "undefined") {
    try {
      cache = await caches.open(CACHE);
      const hit = await cache.match(url);
      if (hit) {
        aoProgredir?.({ status: "cache", progresso: 1, recebido: 0, total: 0, arquivo: rotulo });
        return await hit.arrayBuffer();
      }
    } catch {
      cache = null; // modo privado ou cota indisponível
    }
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`[vozz] Falha ao baixar ${rotulo || url}: HTTP ${resp.status}`);
  }

  const total = Number(resp.headers.get("content-length")) || 0;

  // Sem stream (ou sem content-length) não dá para reportar progresso fino.
  if (!resp.body || !total) {
    const buf = await resp.arrayBuffer();
    aoProgredir?.({ status: "baixando", progresso: 1, recebido: buf.byteLength, total: buf.byteLength, arquivo: rotulo });
    if (cache) {
      try { await cache.put(url, new Response(buf.slice(0), { headers: resp.headers })); } catch { /* cota */ }
    }
    return buf;
  }

  const leitor = resp.body.getReader();
  const pedacos = [];
  let recebido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    recebido += value.length;
    aoProgredir?.({ status: "baixando", progresso: recebido / total, recebido, total, arquivo: rotulo });
  }

  const buf = new Uint8Array(recebido);
  let off = 0;
  for (const p of pedacos) { buf.set(p, off); off += p.length; }

  if (cache) {
    try { await cache.put(url, new Response(buf.slice(0), { headers: resp.headers })); } catch { /* cota */ }
  }
  return buf.buffer;
}

/** Detecta o melhor backend disponível. */
async function escolherDispositivo(pref) {
  if (pref && pref !== "auto") return pref;
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const ad = await navigator.gpu.requestAdapter();
      if (ad) return "webgpu";
    } catch { /* sem WebGPU */ }
  }
  return "wasm";
}

/**
 * Motor Piper.
 *
 *   import { Piper } from "@pedrobef/vozz/piper";
 *   const tts = await Piper.carregar({ aoProgredir: p => console.log(p.progresso) });
 *   (await tts.falar("Olá, tudo bem?")).tocar();
 */
export class Piper {
  /** @private */
  constructor(sessao, config, ort, info) {
    this.sessao = sessao;
    this.config = config;
    this.ort = ort;
    this.dispositivo = info.dispositivo;
    this.taxa = config.audio?.sample_rate ?? 22050;
    this.mapa = config.phoneme_id_map ?? {};
    const inf = config.inference ?? {};
    this.padrao = {
      ruido: inf.noise_scale ?? 0.667,
      duracao: inf.length_scale ?? 1,
      ruidoW: inf.noise_w ?? 0.8,
    };
  }

  /**
   * Baixa o modelo (uma vez) e inicializa a sessão de inferência.
   * @param {OpcoesCarregar} [opcoes]
   */
  static async carregar(opcoes = {}) {
    const {
      cdn = CDN_PADRAO,
      urlModelo = `${cdn}/${ARQ_MODELO}`,
      urlConfig = `${cdn}/${ARQ_CONFIG}`,
      dispositivo = "auto",
      aoProgredir = null,
      cache = true,
    } = opcoes;

    const ort = await carregarRuntime();
    const alvo = await escolherDispositivo(dispositivo);

    // A config é pequena: baixa primeiro para falhar rápido se a URL estiver errada.
    const cfgBuf = await baixar(urlConfig, { aoProgredir, usarCache: cache, rotulo: "config" });
    const config = JSON.parse(new TextDecoder().decode(cfgBuf));

    const modeloBuf = await baixar(urlModelo, { aoProgredir, usarCache: cache, rotulo: "modelo" });

    aoProgredir?.({ status: "iniciando", progresso: 1, recebido: 0, total: 0, arquivo: "sessão" });

    const opcoesSessao = {
      executionProviders: alvo === "webgpu" ? ["webgpu", "wasm"] : ["wasm"],
      graphOptimizationLevel: "all",
    };

    let sessao;
    try {
      sessao = await ort.InferenceSession.create(modeloBuf, opcoesSessao);
    } catch (e) {
      // WebGPU ainda não cobre todos os operadores; cai para WASM.
      if (alvo === "webgpu") {
        sessao = await ort.InferenceSession.create(modeloBuf, {
          executionProviders: ["wasm"], graphOptimizationLevel: "all",
        });
        return new Piper(sessao, config, ort, { dispositivo: "wasm" });
      }
      throw e;
    }

    aoProgredir?.({ status: "pronto", progresso: 1, recebido: 0, total: 0 });
    return new Piper(sessao, config, ort, { dispositivo: alvo });
  }

  /** Texto → IPA (mesmo G2P pt-BR do restante do pacote). */
  static fonemizar(texto, opcoes) {
    return fonemizar(texto, opcoes);
  }

  /**
   * Converte IPA nos ids que o modelo espera.
   *
   * O Piper usa o formato do espeak: um símbolo de início (^), um separador
   * (_) entre cada fonema e um de fim ($). O separador é obrigatório — sem
   * ele o alinhamento interno do VITS sai errado e o áudio fica arrastado.
   *
   * @param {string} ipa
   * @returns {number[]}
   */
  idsDeFonemas(ipa) {
    const m = this.mapa;
    const pad = m["_"]?.[0] ?? 0;
    const ids = [];
    if (m["^"]) ids.push(m["^"][0], pad);

    // NFD: o mapa do Piper usa vogal + diacrítico combinante separados.
    for (const ch of ipa.normalize("NFD")) {
      const e = m[ch];
      if (e) ids.push(e[0], pad);
      // Símbolo desconhecido é ignorado: melhor omitir do que gerar ruído.
    }
    if (m["$"]) ids.push(m["$"][0]);
    return ids;
  }

  /**
   * Sintetiza uma cadeia IPA.
   * @param {string} ipa
   * @param {{velocidade?:number, ruido?:number, ruidoW?:number}} [opcoes]
   * @returns {Promise<Audio>}
   */
  async sintetizarIPA(ipa, opcoes = {}) {
    const ids = this.idsDeFonemas(ipa);
    if (ids.length <= 2) return new Audio(new Float32Array(0), this.taxa);

    const { Tensor } = this.ort;
    // length_scale > 1 deixa a fala mais lenta; invertemos para que
    // `velocidade` siga a intuição do usuário (2 = duas vezes mais rápido).
    const escalaDuracao = this.padrao.duracao / (opcoes.velocidade ?? 1);

    const entradas = {
      input: new Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
      input_lengths: new Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new Tensor("float32", Float32Array.from([
        opcoes.ruido ?? this.padrao.ruido,
        escalaDuracao,
        opcoes.ruidoW ?? this.padrao.ruidoW,
      ]), [3]),
    };

    const saida = await this.sessao.run(entradas);
    const bruto = saida[this.sessao.outputNames[0]].data;
    return new Audio(bruto instanceof Float32Array ? bruto : Float32Array.from(bruto), this.taxa);
  }

  /**
   * Sintetiza texto em português.
   * @param {string} texto
   * @param {{velocidade?:number, ruido?:number, ruidoW?:number, lexico?:object}} [opcoes]
   * @returns {Promise<Audio>}
   */
  async falar(texto, opcoes = {}) {
    const partes = [];
    for await (const t of this.falarEmFluxo(texto, opcoes)) partes.push(t.audio);
    if (!partes.length) return new Audio(new Float32Array(0), this.taxa);
    return Audio.concatenar(partes, 0.10);
  }

  /**
   * Sintetiza em fluxo: entrega cada sentença assim que fica pronta, o que
   * permite começar a tocar sem esperar o texto inteiro.
   *
   * @param {string|DivisorDeTexto} entrada
   * @param {object} [opcoes]
   */
  async *falarEmFluxo(entrada, opcoes = {}) {
    const fonte = entrada instanceof DivisorDeTexto
      ? entrada
      : (function* () { for (const s of dividirEmSentencas(String(entrada ?? ""))) yield s; })();

    for await (const sentenca of fonte) {
      const limpa = String(sentenca).trim();
      if (!limpa) continue;
      const ipa = fonemizar(limpa, { lexico: opcoes.lexico });
      if (!ipa) continue;
      const audio = await this.sintetizarIPA(ipa, opcoes);
      yield { texto: limpa, fonemas: ipa, audio };
    }
  }

  /** Libera a sessão de inferência. */
  async liberar() {
    await this.sessao?.release?.();
  }

  /** Remove o modelo do cache do navegador. */
  static async limparCache() {
    if (typeof caches === "undefined") return false;
    return caches.delete(CACHE);
  }
}

/** Carrega o onnxruntime conforme o ambiente (web ou Node). */
async function carregarRuntime() {
  const noNavegador = typeof window !== "undefined" || typeof self !== "undefined";
  const especificador = noNavegador ? "onnxruntime-web" : "onnxruntime-node";
  try {
    return await import(/* @vite-ignore */ especificador);
  } catch (e) {
    throw new Error(
      `[vozz] Instale o runtime ONNX: npm i ${especificador}\n` +
      `  (motivo: ${e?.message ?? e})`,
    );
  }
}

export default Piper;
export { Audio } from "./audio.js";
export { fonemizar } from "./g2p/index.js";
export { DivisorDeTexto } from "./splitter.js";
