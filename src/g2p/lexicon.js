/**
 * Léxico de exceções pt-BR.
 *
 * Cobre (a) palavras de altíssima frequência, (b) casos em que a vogal tônica
 * aberta/fechada não é dedutível pela ortografia, e (c) estrangeirismos.
 *
 * Convenção IPA idêntica à do espeak-ng `pt-br`, que é a base de treino do
 * modelo neural. Use `ɡ` (U+0261), nunca o "g" ASCII: o "g" latino não existe
 * no vocabulário do modelo e vira token desconhecido.
 */

/** Palavras átonas (clíticos): entram na cadeia sem acento primário. */
export const CLITICOS = new Map(Object.entries({
  a: "a", as: "as", o: "ʊ", os: "ʊs",
  um: "ũŋ", uns: "ũŋs", uma: "umæ", umas: "umæs",
  de: "dʒy", do: "dʊ", da: "da", dos: "dʊs", das: "das",
  em: "eɪŋ", no: "nʊ", na: "na", nos: "nʊs", nas: "nas",
  num: "nũŋ", numa: "numæ",
  por: "por", pelo: "pelʊ", pela: "pelæ",
  pelos: "pelʊs", pelas: "pelæs",
  ao: "aʊ", aos: "aʊs", à: "a", às: "as",
  e: "i", ou: "oʊ", que: "ky", se: "sy",
  me: "my", te: "tʃy", lhe: "ʎy", nos_: "nʊs", vos: "vus",
  com: "koŋ", sem: "seɪŋ", para: "paɾæ", pra: "pra",
  é: "ɛ", às_: "as",
}));

/**
 * Exceções lexicais plenas (com marca de tônica).
 * Verificadas contra `espeak-ng -v pt-br -q --ipa`.
 */
export const LEXICO = new Map(Object.entries({
  // --- verbos e palavras funcionais de alta frequência ---
  não: "nˈɐ̃ʊ̃", sim: "sˈiŋ", também: "tɐ̃mbˈeɪŋ",
  então: "eɪŋtˈɐ̃ʊ̃", muito: "mwˈiŋtʊ", muita: "mwˈiŋtæ",
  muitos: "mwˈiŋtʊs", muitas: "mwˈiŋtæs",
  bem: "bˈeɪŋ", tem: "tˈeɪŋ", têm: "tˈeɪŋ", vem: "vˈeɪŋ",
  são: "sˈɐ̃ʊ̃", estão: "estˈɐ̃ʊ̃", está: "estˈa", estou: "estˈow",
  ser: "sˈer", ter: "tˈer", ver: "vˈer", vir: "vˈir", pôr: "pˈor",
  fazer: "fazˈer", dizer: "dʒizˈer", poder: "podˈer", querer: "keɾˈer",
  hoje: "ˈoʒy", ontem: "ˈoŋteɪŋ", amanhã: "ˌæmɐ̃ɲˈɐ̃",
  agora: "ˌaɡˈɔɾæ", depois: "depˈoɪs", antes: "ˈɐ̃ŋtʃys",
  sempre: "sˈeɪmpry", nunca: "nˈũŋkæ", ainda: "ˌaˈiŋdæ",
  aqui: "akˈi", ali: "alˈi", lá: "lˈa", cá: "kˈa",
  já: "ʒˈa", só: "sˈɔ", até: "ɛaɡudʊ", após: "apˈɔs",
  mais: "mˈaɪs", mas: "mˈas", menos: "mˈenʊs",
  onde: "ˈoŋdʒy", quando: "kwˈɐ̃ŋdʊ", como: "kˈomʊ",
  porque: "pˈoɾəky", porquê: "poɾəkˈe", quem: "kˈeɪŋ",
  qual: "kwˈaʊ", quais: "kwˈaɪs", quanto: "kwˈɐ̃ŋtʊ",
  todo: "tˈodʊ", toda: "tˈodæ", todos: "tˈodʊs", todas: "tˈodæs",
  outro: "ˈowtrʊ", outra: "ˈowtræ", mesmo: "mˈezmʊ", mesma: "mˈezmæ",
  cada: "kˈadæ", algum: "aʊɡˈũŋ", alguma: "ˌaʊɡˈumæ",
  nada: "nˈadæ", tudo: "tˈudʊ", algo: "ˈaʊɡʊ",
  ele: "ˈely", ela: "ˈɛlæ", eles: "ˈelys", elas: "ˈɛlæs",
  eu: "ˈeʊ", tu: "tˈu", nós: "nˈɔs", vós: "vˈɔs",
  você: "vosˈe", vocês: "vosˈes", gente: "ʒˈeɪŋtʃy",
  isso: "ˈisʊ", isto: "ˈistʊ", aquilo: "ˌakˈilʊ",
  esse: "ˈesi", essa: "ˈɛsæ", este: "ˈestʃy", esta: "ˈɛstæ",
  meu: "mˈeʊ", minha: "mˈiɲæ", seu: "sˈeʊ", sua: "sˈuæ",
  nosso: "nˈɔsʊ", nossa: "nˈɔsæ",
  obrigado: "ˌobriɡˈadʊ", obrigada: "ˌobriɡˈadæ",
  favor: "favˈor", desculpa: "dˌeskˈuwpæ",
  oi: "ˈoɪ", olá: "olˈa", tchau: "tʃˈaʊ",
  bom: "bˈoŋ", boa: "bˈoæ", boas: "bˈoæs", bons: "bˈoŋs",
  dia: "dʒˈiæ", dias: "dʒˈiæs", noite: "nˈoɪtʃy", tarde: "tˈaɾədʒy",
  ano: "ˈɐ̃nʊ", anos: "ˈɐ̃nʊs", mês: "mˈes", hora: "ˈɔɾæ", horas: "ˈɔɾæs",
  vez: "vˈes", vezes: "vˈezys", coisa: "kˈoɪzæ", coisas: "kˈoɪzæs",
  pessoa: "pˌesˈoæ", pessoas: "pˌesˈoæs",
  brasil: "brazˈiʊ", brasileiro: "brˌazilˈeɪɾʊ", brasileira: "brˌazilˈeɪɾæ",
  português: "pˌoɾətuɡˈes", portuguesa: "pˌoɾətuɡˈezæ",
  senhor: "seɲˈor", senhora: "sˌeɲˈɔɾæ",

  // --- vogais tônicas abertas imprevisíveis ---
  café: "kafˈɛ", pé: "pˈɛ", fé: "fˈɛ", né: "nˈɛ",
  avó: "avˈɔ", avô: "avˈo", vovó: "vovˈɔ", vovô: "vovˈo",
  história: "ˌistˈɔɾjæ", memória: "mˌemˈɔɾjæ", vitória: "vˌitˈɔɾjæ",
  possível: "pˌosˈiveʊ", difícil: "dʒˌifˈisiʊ", fácil: "fˈasiʊ",
  útil: "ˈutʃiʊ", nível: "nˈiveʊ", móvel: "mˈɔvɛʊ",
  novo: "nˈovʊ", nova: "nˈɔvæ", novos: "nˈɔvʊs", novas: "nˈɔvæs",
  jogo: "ʒˈoɡʊ", jogos: "ʒˈɔɡʊs", porco: "pˈoɾəkʊ", corpo: "kˈoɾəpʊ",
  força: "fˈoɾəsæ", morte: "mˈɔɾətʃy", sorte: "sˈɔɾətʃy",
  sol: "sˈɔl", mar: "mˈar", flor: "flˈor", cor: "kˈor",
  melhor: "meljˈɔr", pior: "piˈɔr", maior: "maɪˈɔr",
  amor: "æmˈor", dor: "dˈor", calor: "kalˈor",
  papel: "papˈɛʊ", anel: "ɐ̃nˈɛʊ", hotel: "otˈɛʊ",
  água: "ˈaɡwæ", língua: "lˈiŋɡwæ", antigo: "ˌɐ̃ŋtʃˈiɡʊ",

  // --- dígrafos e grupos difíceis ---
  exemplo: "ˌezˈeɪmplʊ", exato: "ˌezˈatʊ", exame: "ˌezˈɐ̃my",
  texto: "tˈestʊ", próximo: "prˈɔsimʊ", máximo: "mˈasimʊ",
  sexta: "sˈestæ", excelente: "ˌeselˈeɪŋtʃy", exercício: "ˌezeɾəsˈisjʊ",
  táxi: "tˈaksi", fixo: "fˈiksʊ", sexo: "sˈɛksʊ",
  peixe: "pˈeɪʃy", caixa: "kˈaɪʃæ", baixo: "bˈaɪʃʊ",
  trabalho: "trˌabˈaljʊ", filho: "fˈiljʊ", filha: "fˈiljæ",
  velho: "vˈɛljʊ", olho: "ˈɔljʊ", milho: "mˈiljʊ",
  vinho: "vˈiɲʊ", sonho: "sˈoɲʊ", banho: "bˈɐ̃ɲʊ",
  tenho: "tˈeɲʊ", venho: "vˈeɲʊ", ganho: "ɡˈɐ̃ɲʊ",
  carro: "kˈaxʊ", caro: "kˈaɾʊ", terra: "tˈɛxæ", cara: "kˈaɾæ",
  guerra: "ɡˈɛxæ", cachorro: "kˌaʃˈoxʊ", correr: "koxˈer",
  razão: "xazˈɐ̃ʊ̃", coração: "kˌoɾasˈɐ̃ʊ̃", nação: "nasˈɐ̃ʊ̃",
  mãe: "mˈɐ̃y", pão: "pˈɐ̃ʊ̃", cão: "kˈɐ̃ʊ̃", irmão: "iɾəmˈɐ̃ʊ̃",
  alemão: "ˌalemˈɐ̃ʊ̃", verão: "veɾˈɐ̃ʊ̃",

  // --- tecnologia / estrangeirismos ---
  site: "sˈaɪtʃy", email: "ˌemaˈiʊ", online: "oŋlˈaɪŋ",
  software: "sˈɔftweə", hardware: "xˈaɾdiwɛɾ", mouse: "mˈaʊzi",
  internet: "ˌiŋteɾənˈɛtʃ", wifi: "wifˈi", app: "ˈap",
  // Siglas técnicas lidas letra a letra (sem vogal, o G2P as leria como palavra).
  npm: "ˈeni pˈe ˈemi", api: "ˌapiˈi", url: "ˌuˈɛli", css: "sˈe ˈesi ˈesi",
  html: "ˌaɡˈa tˈe ˈemi ˈɛli", sql: "ˌɛsi kˈu ˈɛli", cli: "sˈe ˈɛli ˈi",
  json: "ʒˈejzõŋ", npx: "ˈeni pˈe ʃˈis",
  smartphone: "zmˌaɾətfˈony", link: "lˈiŋk", download: "daʊŋlˈowd",
  design: "dezˈaɪn", startup: "staɾətˈup", feedback: "fˌeedbˈak",
  google: "ɡˈuɡol", youtube: "jˌowtˈuby", whatsapp: "watsˈap",
}));

/** Consulta o léxico. Devolve `null` se a palavra não estiver mapeada. */
export function buscarLexico(palavra) {
  const chave = palavra.toLowerCase();
  if (LEXICO.has(chave)) return LEXICO.get(chave);
  return null;
}

/** Consulta clíticos átonos. */
export function buscarClitico(palavra) {
  const chave = palavra.toLowerCase();
  return CLITICOS.has(chave) ? CLITICOS.get(chave) : null;
}
