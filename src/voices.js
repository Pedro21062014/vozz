/**
 * Catálogo de vozes pt-BR.
 *
 * Os pesos vêm do Kokoro-82M (Apache-2.0). Cada arquivo `.bin` tem ~520 KB e é
 * baixado sob demanda, uma única vez, ficando no cache do navegador.
 */

export const REPO_PADRAO = "onnx-community/Kokoro-82M-v1.0-ONNX";

/**
 * @typedef {Object} Voz
 * @property {string} id            identificador interno (nome do arquivo)
 * @property {string} nome          nome amigável
 * @property {'feminina'|'masculina'} genero
 * @property {string} descricao
 * @property {string} idioma
 */

/** @type {Record<string, Voz>} */
export const VOZES = Object.freeze({
  dora: {
    id: "pf_dora",
    nome: "Dora",
    genero: "feminina",
    idioma: "pt-BR",
    descricao: "Voz feminina clara e natural. Ótima para narração, leitura e assistentes.",
  },
  alex: {
    id: "pm_alex",
    nome: "Alex",
    genero: "masculina",
    idioma: "pt-BR",
    descricao: "Voz masculina neutra e equilibrada. Boa para tutoriais e conteúdo geral.",
  },
  santa: {
    id: "pm_santa",
    nome: "Santa",
    genero: "masculina",
    idioma: "pt-BR",
    descricao: "Voz masculina mais grave e encorpada. Boa para narração dramática.",
  },
});

/** Aliases aceitos em `voz:`. */
const ALIASES = {
  pf_dora: "dora",
  pm_alex: "alex",
  pm_santa: "santa",
  feminina: "dora",
  masculina: "alex",
  female: "dora",
  male: "alex",
  f: "dora",
  m: "alex",
};

/**
 * Resolve o identificador de uma voz.
 * @param {string} nome
 * @returns {Voz}
 */
export function resolverVoz(nome) {
  const chave = String(nome ?? "dora").toLowerCase().trim();
  const alvo = VOZES[chave] ? chave : ALIASES[chave];
  if (!alvo || !VOZES[alvo]) {
    const disponiveis = Object.keys(VOZES).join(", ");
    throw new Error(
      `[vozz] Voz "${nome}" não existe. Disponíveis: ${disponiveis}.`,
    );
  }
  return VOZES[alvo];
}

/** Lista as vozes disponíveis. */
export function listarVozes() {
  return Object.values(VOZES);
}

/** URL do embedding de uma voz. */
export function urlVoz(idVoz, repo = REPO_PADRAO) {
  return `https://huggingface.co/${repo}/resolve/main/voices/${idVoz}.bin`;
}
