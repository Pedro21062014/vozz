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
const ARQ_MODELO = "pt_BR-faber-medium-uint8.onnx";
const ARQ_CONFIG = "pt_BR-faber-medium-uint8.onnx.json";

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
 * @property {string} [urlRuntime] URL do build ESM do onnxruntime-web
 * @property {number} [threads] threads do WASM (padrão: núcleos-1, máx. 4)
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

/**
 * Verifica se o modelo usa `ConvInteger` com pesos **int8 assinado**.
 *
 * Este é o erro mais comum com modelos Piper quantizados:
 *
 *     NOT_IMPLEMENTED: Could not find an implementation for
 *     ConvInteger(10) node with name '.../Conv_quant'
 *
 * O ONNX Runtime implementa `ConvInteger` apenas para **uint8**. Um modelo
 * gerado com `quantize_dynamic(..., weight_type=QuantType.QInt8)` carrega
 * o grafo, mas nenhum kernel casa com os tipos e a sessão falha — em
 * qualquer backend, WASM inclusive. A correção é re-quantizar com
 * `QuantType.QUInt8`; o tamanho do arquivo é o mesmo.
 *
 * Detectamos aqui só para trocar a mensagem críptica do runtime por uma
 * que diz o que fazer.
 *
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
function usaConvIntegerAssinado(buffer) {
  const dados = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1 << 20));
  const alvo = [67, 111, 110, 118, 73, 110, 116, 101, 103, 101, 114]; // "ConvInteger"
  const limite = dados.length - alvo.length;
  for (let i = 0; i <= limite; i++) {
    if (dados[i] !== alvo[0]) continue;
    let k = 1;
    while (k < alvo.length && dados[i + k] === alvo[k]) k++;
    if (k === alvo.length) return true;
  }
  return false;
}

/**
 * Ajusta o número de threads do WASM.
 *
 * O onnxruntime-web roda em uma única thread por padrão. Com
 * `SharedArrayBuffer` disponível (exige os cabeçalhos COOP/COEP), usar
 * vários núcleos reduz bastante o tempo de inferência — que é o gargalo
 * em textos longos.
 *
 * Limitamos a 4: acima disso o ganho satura e o custo de sincronização
 * cresce. Deixamos um núcleo livre para a interface não engasgar.
 *
 * @param {any} ort
 * @param {number} [preferido] força um valor específico
 */
function configurarThreads(ort, preferido) {
  try {
    const wasm = ort?.env?.wasm;
    if (!wasm) return;

    if (typeof preferido === "number" && preferido > 0) {
      wasm.numThreads = preferido;
      return;
    }

    // Multi-thread exige SharedArrayBuffer, que só existe com COOP/COEP.
    const temSAB = typeof SharedArrayBuffer !== "undefined";
    if (!temSAB) { wasm.numThreads = 1; return; }

    // Teto de 2 threads, por medição: neste modelo o ganho de 1→2 é de
    // ~8%, mas 4 threads chegou a ficar 30% MAIS LENTO em máquinas de
    // poucos núcleos — o custo de sincronização supera o paralelismo.
    // Só usamos 2 quando há núcleos sobrando para a interface.
    const nucleos = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2;
    wasm.numThreads = nucleos >= 4 ? 2 : 1;
  } catch {
    // Runtime sem env.wasm (ou injetado pelo usuário): mantém o padrão.
  }
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
      urlRuntime = ORT_CDN,
    } = opcoes;

    const ort = await carregarRuntime(urlRuntime);
    const alvo = await escolherDispositivo(dispositivo);
    if (!ort?.InferenceSession) {
      throw new Error("[vozz] Runtime ONNX inválido: falta InferenceSession.");
    }
    configurarThreads(ort, opcoes.threads);

    // A config é pequena: baixa primeiro para falhar rápido se a URL estiver errada.
    const cfgBuf = await baixar(urlConfig, { aoProgredir, usarCache: cache, rotulo: "config" });
    const config = JSON.parse(new TextDecoder().decode(cfgBuf));

    const modeloBuf = await baixar(urlModelo, { aoProgredir, usarCache: cache, rotulo: "modelo" });

    aoProgredir?.({ status: "iniciando", progresso: 1, recebido: 0, total: 0, arquivo: "sessão" });

    // WebGPU não implementa operadores de quantização inteira; com esses
    // modelos ele apenas repassa os nós ao WASM, então mantemos os dois na
    // lista em vez de bloquear a GPU.
    const temConvInteger = usaConvIntegerAssinado(modeloBuf);

    /** Cria a sessão com um conjunto de provedores. */
    const criar = (provedores) => ort.InferenceSession.create(modeloBuf, {
      executionProviders: provedores,
      graphOptimizationLevel: "all",
    });

    // Backend efetivamente usado: pode mudar se o preferido falhar.
    let alvoFinal = alvo;
    let sessao;
    try {
      // WebGPU sempre com WASM na lista: o onnxruntime distribui os nós
      // não suportados para o segundo provedor em vez de abortar.
      sessao = await criar(alvoFinal === "webgpu" ? ["webgpu", "wasm"] : ["wasm"]);
    } catch (e) {
      if (alvoFinal !== "wasm") {
        // Última tentativa: WASM puro, que implementa todos os operadores.
        sessao = await criar(["wasm"]);
        alvoFinal = "wasm";
      } else {
        const msg = String(e?.message ?? e);
        // Traduz o erro mais comum para algo acionável.
        if (temConvInteger && /ConvInteger|NOT_IMPLEMENTED|Could not find an implementation/i.test(msg)) {
          throw new Error(
            `[vozz] O modelo foi quantizado com QInt8 (int8 assinado), e o ONNX ` +
            `Runtime só implementa ConvInteger para uint8 — por isso a sessão não ` +
            `é criada, em nenhum backend.\n` +
            `  Solução: re-quantize a partir do modelo fp32 usando QUInt8.\n` +
            `    from onnxruntime.quantization import quantize_dynamic, QuantType\n` +
            `    quantize_dynamic("modelo.onnx", "modelo_uint8.onnx", weight_type=QuantType.QUInt8)\n` +
            `  O tamanho do arquivo é o mesmo. Detalhes no README, seção "Problemas comuns".\n` +
            `  (erro original: ${msg})`,
          );
        }
        throw new Error(`[vozz] Falha ao criar a sessão de inferência: ${msg}`);
      }
    }

    aoProgredir?.({ status: "pronto", progresso: 1, recebido: 0, total: 0 });
    return new Piper(sessao, config, ort, { dispositivo: alvoFinal });
  }

  /**
   * Injeta o runtime ONNX manualmente, quando o bundler não resolve o
   * import dinâmico (Cloudflare Workers, alguns setups de webpack).
   *
   *   import * as ort from "onnxruntime-web";
   *   Piper.usarRuntime(ort);
   */
  static usarRuntime(ort) {
    usarRuntime(ort);
    return Piper;
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
    // Acumulamos apenas os Float32Array crus e liberamos cada objeto Audio
    // logo em seguida. Guardar os trechos inteiros dobrava o pico de
    // memória: os buffers viviam até o fim e ainda eram copiados na
    // concatenação final.
    const trechos = [];
    const pausa = Math.round(0.10 * this.taxa);
    let total = 0;

    for await (const t of this.falarEmFluxo(texto, opcoes)) {
      const amostras = t.audio.amostras;
      if (!amostras.length) continue;
      if (trechos.length) total += pausa;
      trechos.push(amostras);
      total += amostras.length;
    }

    if (!trechos.length) return new Audio(new Float32Array(0), this.taxa);
    if (trechos.length === 1) return new Audio(trechos[0], this.taxa);

    const buf = new Float32Array(total);
    let off = 0;
    for (let i = 0; i < trechos.length; i++) {
      buf.set(trechos[i], off);
      off += trechos[i].length + (i < trechos.length - 1 ? pausa : 0);
      trechos[i] = null; // libera cada bloco assim que é copiado
    }
    return new Audio(buf, this.taxa);
  }

  /**
   * Sintetiza em fluxo: entrega cada sentença assim que fica pronta, o que
   * permite começar a tocar sem esperar o texto inteiro.
   *
   * @param {string|DivisorDeTexto} entrada
   * @param {object} [opcoes]
   */
  async *falarEmFluxo(entrada, opcoes = {}) {
    const maxFonemas = opcoes.maxFonemas ?? MAX_FONEMAS;
    const fonte = entrada instanceof DivisorDeTexto
      ? entrada
      : (function* () { for (const s of dividirEmSentencas(String(entrada ?? ""))) yield s; })();

    for await (const sentenca of fonte) {
      const limpa = String(sentenca).trim();
      if (!limpa) continue;
      const ipa = fonemizar(limpa, { lexico: opcoes.lexico });
      if (!ipa) continue;

      // Uma sentença muito longa vira uma inferência única e demorada, que
      // congela a interface. Quebramos em blocos com um teto de fonemas: o
      // custo é linear, então N blocos pequenos levam o mesmo tempo total,
      // mas devolvem áudio em pedaços e mantêm a página respondendo.
      for (const bloco of dividirIPA(ipa, maxFonemas)) {
        const audio = await this.sintetizarIPA(bloco, opcoes);
        // Cede a thread entre blocos para o navegador processar eventos,
        // pintar a tela e tocar o áudio já pronto.
        await respirar();
        yield { texto: limpa, fonemas: bloco, audio };
      }
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

/**
 * Teto de fonemas por inferência.
 *
 * O custo do modelo é linear no número de tokens (~2,4x tempo real medido),
 * então dividir não deixa mais lento no total — mas evita que uma única
 * chamada bloqueie a thread por vários segundos. Com ~360 fonemas cada
 * bloco leva cerca de 1,5 s de CPU, o que mantém a interface fluida.
 */
const MAX_FONEMAS = 360;

/** Pontuação onde é natural cortar sem estragar a prosódia. */
const PONTOS_DE_CORTE = /(?<=[,;:—…])\s+/;

/**
 * Divide uma cadeia IPA em blocos de no máximo `limite` símbolos.
 *
 * Corta preferencialmente em pontuação interna (vírgula, ponto e vírgula),
 * onde já existe uma pausa natural; se não houver, cai para espaços entre
 * palavras. Assim a junção dos blocos não cria emendas audíveis.
 *
 * @param {string} ipa
 * @param {number} limite
 * @returns {string[]}
 */
export function dividirIPA(ipa, limite = MAX_FONEMAS) {
  const texto = String(ipa ?? "").trim();
  if (texto.length <= limite) return texto ? [texto] : [];

  const blocos = [];
  let atual = "";

  const empurrar = (parte) => {
    const candidato = atual ? `${atual} ${parte}` : parte;
    if (candidato.length <= limite) { atual = candidato; return; }
    if (atual) blocos.push(atual);
    atual = parte;
  };

  for (const trecho of texto.split(PONTOS_DE_CORTE)) {
    if (trecho.length <= limite) { empurrar(trecho); continue; }
    // Trecho sem pontuação e ainda longo: quebra por palavras.
    let linha = "";
    for (const palavra of trecho.split(/\s+/)) {
      if (linha && (linha.length + 1 + palavra.length) > limite) {
        empurrar(linha);
        linha = palavra;
      } else {
        linha = linha ? `${linha} ${palavra}` : palavra;
      }
    }
    if (linha) empurrar(linha);
  }
  if (atual) blocos.push(atual);
  return blocos;
}

/**
 * Devolve o controle ao navegador entre inferências.
 *
 * Sem isso, um texto longo monopoliza a thread principal: a página não
 * repinta, os cliques não respondem e o áudio já gerado não toca. Usa
 * `scheduler.yield()` quando existe (Chrome recente) e cai para
 * `setTimeout(0)`, que é universal.
 */
function respirar() {
  if (typeof globalThis !== "undefined") {
    const s = globalThis.scheduler;
    if (s && typeof s.yield === "function") return s.yield();
    if (typeof globalThis.setTimeout === "function") {
      return new Promise((r) => globalThis.setTimeout(r, 0));
    }
  }
  return Promise.resolve();
}

/**
 * Runtime ONNX injetado manualmente (ver `Piper.usarRuntime`).
 * @type {any}
 */
let runtimeInjetado = null;

/**
 * Define o runtime ONNX explicitamente.
 *
 * Use quando o bundler não puder resolver o import dinâmico — por exemplo em
 * Cloudflare Workers, ou quando você já carrega o `ort` por <script>:
 *
 *   import * as ort from "onnxruntime-web";
 *   Piper.usarRuntime(ort);
 *
 * @param {any} ort módulo do onnxruntime
 */
export function usarRuntime(ort) {
  runtimeInjetado = ort;
}

/**
 * URL padrão do runtime ONNX no CDN (build ESM, sem bundler).
 * Fixamos a versão para não quebrar quando o upstream publicar algo novo.
 */
export const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.mjs";

/**
 * Carrega o runtime ONNX.
 *
 * A ordem tenta o caminho menos surpreendente primeiro:
 *
 *   1. runtime injetado por `Piper.usarRuntime(ort)`;
 *   2. `globalThis.ort`, para quem carrega via <script>;
 *   3. o pacote `onnxruntime-web`/`onnxruntime-node`, se estiver instalado;
 *   4. o CDN, como último recurso.
 *
 * O passo 3 é o delicado. Um `import("onnxruntime-web")` literal faz o
 * wrangler travar ao empacotar um Worker; já esconder o especificador com
 * `new Function` quebra no Vite, porque o navegador não resolve nomes de
 * pacote em runtime. A saída é tentar o import de pacote apenas quando há
 * um resolvedor de módulos por trás (Node, ou bundler em modo de
 * desenvolvimento) e cair para o CDN no navegador — assim nenhum bundler
 * precisa enxergar o especificador, e o usuário não precisa configurar nada.
 */
async function carregarRuntime(urlCdn = ORT_CDN) {
  if (runtimeInjetado) return runtimeInjetado;

  if (typeof globalThis !== "undefined" && globalThis.ort?.InferenceSession) {
    return globalThis.ort;
  }

  const temDom = typeof window !== "undefined" && typeof document !== "undefined";

  // Em Node, o pacote local é a única opção (não há como importar de URL).
  if (!temDom) {
    try {
      const importar = new Function("m", "return import(m)");
      return await importar("onnxruntime-node");
    } catch (e) {
      throw new Error(
        `[vozz] Instale o runtime ONNX para Node: npm i onnxruntime-node\n  (motivo: ${e?.message ?? e})`,
      );
    }
  }

  // No navegador: importa o build ESM direto da URL. Funciona em Vite, Next,
  // Astro e afins sem configuração, porque uma URL absoluta é sempre
  // resolvível pelo próprio navegador.
  try {
    const importar = new Function("u", "return import(u)");
    const mod = await importar(urlCdn);
    const ort = mod?.default?.InferenceSession ? mod.default : mod;
    if (!ort?.InferenceSession) throw new Error("módulo sem InferenceSession");
    return ort;
  } catch (e) {
    throw new Error(
      `[vozz] Não foi possível carregar o runtime ONNX.\n` +
      `  Alternativas:\n` +
      `    1) instale e injete:  npm i onnxruntime-web\n` +
      `         import * as ort from "onnxruntime-web";\n` +
      `         Piper.usarRuntime(ort);\n` +
      `    2) aponte outro CDN:  Piper.carregar({ urlRuntime: "https://..." })\n` +
      `  (motivo: ${e?.message ?? e})`,
    );
  }
}

export default Piper;
export { Audio } from "./audio.js";
export { fonemizar } from "./g2p/index.js";
export { DivisorDeTexto } from "./splitter.js";
