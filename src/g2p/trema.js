/**
 * Regras de trema (Acordo Ortográfico de 1990).
 *
 * O trema foi abolido pela reforma de 1990, mas o "u" de "qu"/"gu" continua
 * pronunciado nas palavras que O TINHAM (cinquenta → sĩˈkwẽtɐ, tranquilo,
 * consequência) e mudo nas demais (quente → ˈkẽtʃi, guerra).
 *
 * A lista vem do IME-USP (br-com-trema-latin1.txt, prof. Paulo Feofiloff),
 * compilada como radicais produtivos + palavras fechadas no projeto
 * vozz-g2p-rs (Apache-2.0), de onde foi portada.
 */

/** Palavras fechadas que mantêm o u pronunciado (grafia pós-reforma). */
const PALAVRAS_COM_TREMA = new Set([
  "adeqüei", "adeqüeis", "adeqüemo", "adeqüemos", "agüenta", "agüentado",
  "agüentai", "agüentais", "agüentam", "agüentamo", "agüentamos", "agüentando",
  "agüentar", "agüentara", "agüentaram", "agüentaras", "agüentardes", "agüentarei",
  "agüentareis", "agüentarem", "agüentaremo", "agüentaremos", "agüentares", "agüentaria",
  "agüentariam", "agüentarias", "agüentarmo", "agüentarmos", "agüentará", "agüentarás",
  "agüentarão", "agüentaríamos", "agüentaríeis", "agüentas", "agüentasse", "agüentassem",
  "agüentasses", "agüentaste", "agüentastes", "agüentava", "agüentavam", "agüentavas",
  "agüente", "agüentei", "agüenteis", "agüentem", "agüentemo", "agüentemos",
  "agüentes", "agüento", "agüentou", "agüentá", "agüentáramos", "agüentáreis",
  "agüentásseis", "agüentássemos", "agüentávamos", "agüentáveis", "anhangüera", "antigüidade",
  "antigüidades", "antiqüíssima", "antiqüíssimas", "antiqüíssimo", "antiqüíssimos", "argüi",
  "argüia", "argüiam", "argüias", "argüido", "argüimo", "argüimos",
  "argüindo", "argüir", "argüira", "argüiram", "argüiras", "argüirdes",
  "argüirei", "argüireis", "argüirem", "argüiremo", "argüiremos", "argüires",
  "argüiria", "argüiriam", "argüirias", "argüirmo", "argüirmos", "argüirá",
  "argüirás", "argüirão", "argüiríamos", "argüiríeis", "argüis", "argüisse",
  "argüissem", "argüisses", "argüiste", "argüistes", "argüiu", "argüição",
  "argüições", "argüíamos", "argüíeis", "argüíramos", "argüíreis", "argüísseis",
  "argüíssemos", "audiofreqüência", "audiofreqüências", "cagüetagem", "cinqüenta", "consangüinidade",
  "consangüinidades", "consangüíneo", "consangüíneos", "conseqüente", "conseqüentemente", "conseqüentes",
  "conseqüência", "conseqüências", "contigüidade", "delinqüente", "delinqüentes", "delinqüi",
  "delinqüia", "delinqüiam", "delinqüias", "delinqüido", "delinqüimo", "delinqüimos",
  "delinqüindo", "delinqüir", "delinqüira", "delinqüiram", "delinqüiras", "delinqüirdes",
  "delinqüirei", "delinqüireis", "delinqüirem", "delinqüiremo", "delinqüiremos", "delinqüires",
  "delinqüiria", "delinqüiriam", "delinqüirias", "delinqüirmo", "delinqüirmos", "delinqüirá",
  "delinqüirás", "delinqüirão", "delinqüiríamos", "delinqüiríeis", "delinqüis", "delinqüisse",
  "delinqüissem", "delinqüisses", "delinqüiste", "delinqüistes", "delinqüiu", "delinqüência",
  "delinqüíamos", "delinqüíeis", "delinqüíramos", "delinqüíreis", "delinqüísseis", "delinqüíssemos",
  "eloqüente", "eloqüentemente", "eloqüentes", "eloqüentíssima", "eloqüentíssimas", "eloqüentíssimo",
  "eloqüentíssimos", "eloqüência", "ensagüentada", "ensagüentadas", "ensagüentado", "ensagüentados",
  "ensangüentada", "ensangüentadas", "ensangüentado", "ensangüentados", "eqüidade", "eqüidades",
  "eqüidista", "eqüidistado", "eqüidistai", "eqüidistais", "eqüidistam", "eqüidistamo",
  "eqüidistamos", "eqüidistando", "eqüidistar", "eqüidistara", "eqüidistaram", "eqüidistaras",
  "eqüidistardes", "eqüidistarei", "eqüidistareis", "eqüidistarem", "eqüidistaremo", "eqüidistaremos",
  "eqüidistares", "eqüidistaria", "eqüidistariam", "eqüidistarias", "eqüidistarmo", "eqüidistarmos",
  "eqüidistará", "eqüidistarás", "eqüidistarão", "eqüidistaríamos", "eqüidistaríeis", "eqüidistas",
  "eqüidistasse", "eqüidistassem", "eqüidistasses", "eqüidistaste", "eqüidistastes", "eqüidistava",
  "eqüidistavam", "eqüidistavas", "eqüidiste", "eqüidistei", "eqüidisteis", "eqüidistem",
  "eqüidistemo", "eqüidistemos", "eqüidistes", "eqüidisto", "eqüidistou", "eqüidistá",
  "eqüidistáramos", "eqüidistáreis", "eqüidistásseis", "eqüidistássemos", "eqüidistávamos", "eqüidistáveis",
  "eqüidistância", "eqüilátero", "eqüiláteros", "eqüino", "eqüinos", "eqüitativa",
  "eqüitativas", "eqüitativo", "eqüitativos", "eqüiângulo", "eqüiângulos", "exeqüenda",
  "exeqüendas", "exeqüendo", "exeqüendos", "exeqüente", "exeqüentes", "exeqüibilidade",
  "exeqüibilidades", "exeqüíveis", "exeqüível", "freqüenta", "freqüentada", "freqüentadas",
  "freqüentado", "freqüentador", "freqüentadora", "freqüentadoras", "freqüentadores", "freqüentados",
  "freqüentai", "freqüentais", "freqüentam", "freqüentamo", "freqüentamos", "freqüentando",
  "freqüentar", "freqüentara", "freqüentaram", "freqüentaras", "freqüentardes", "freqüentarei",
  "freqüentareis", "freqüentarem", "freqüentaremo", "freqüentaremos", "freqüentares", "freqüentaria",
  "freqüentariam", "freqüentarias", "freqüentarmo", "freqüentarmos", "freqüentará", "freqüentarás",
  "freqüentarão", "freqüentaríamos", "freqüentaríeis", "freqüentas", "freqüentasse", "freqüentassem",
  "freqüentasses", "freqüentaste", "freqüentastes", "freqüentava", "freqüentavam", "freqüentavas",
  "freqüente", "freqüentei", "freqüenteis", "freqüentem", "freqüentemente", "freqüentemo",
  "freqüentemos", "freqüentes", "freqüento", "freqüentou", "freqüentá", "freqüentáramos",
  "freqüentáreis", "freqüentásseis", "freqüentássemos", "freqüentávamos", "freqüentáveis", "freqüência",
  "freqüências", "grandiloqüência", "inconseqüente", "inconseqüentes", "inconseqüência", "inconseqüências",
  "intranqüila", "intranqüilas", "intranqüilo", "intranqüilos", "lingüeta", "lingüetas",
  "lingüista", "lingüistas", "lingüiça", "lingüiças", "lingüística", "lingüístico",
  "lingüísticos", "liqüefarei", "liqüefareis", "liqüefaremo", "liqüefaremos", "liqüefaria",
  "liqüefariam", "liqüefarias", "liqüefará", "liqüefarás", "liqüefarão", "liqüefaríamos",
  "liqüefaríeis", "liqüefaz", "liqüefaze", "liqüefazei", "liqüefazeis", "liqüefazem",
  "liqüefazemo", "liqüefazemos", "liqüefazendo", "liqüefazer", "liqüefazerdes", "liqüefazerem",
  "liqüefazeres", "liqüefazermos", "liqüefazes", "liqüefazia", "liqüefaziam", "liqüefazias",
  "liqüefazê", "liqüefazíamos", "liqüefazíeis", "liqüefaça", "liqüefaçais", "liqüefaçam",
  "liqüefaçamo", "liqüefaçamos", "liqüefaças", "liqüefaço", "liqüefeito", "liqüefez",
  "liqüefiz", "liqüefizemos", "liqüefizer", "liqüefizera", "liqüefizeram", "liqüefizeras",
  "liqüefizerdes", "liqüefizerem", "liqüefizeres", "liqüefizermo", "liqüefizermos", "liqüefizesse",
  "liqüefizessem", "liqüefizesses", "liqüefizeste", "liqüefizestes", "liqüefizéramos", "liqüefizéreis",
  "liqüefizésseis", "liqüefizéssemos", "qüinquagésima", "qüinquagésimas", "qüinquagésimo", "qüinquagésimos",
  "qüinqüênio", "qüinqüênios", "radiofreqüência", "radiofreqüências", "sangüinária", "sangüinárias",
  "sangüinário", "sangüinários", "sangüínea", "sangüíneas", "sangüíneo", "sangüíneos",
  "seqüela", "seqüelas", "seqüencia", "seqüenciado", "seqüenciai", "seqüenciais",
  "seqüencial", "seqüencialmente", "seqüenciam", "seqüenciamo", "seqüenciamos", "seqüenciando",
  "seqüenciar", "seqüenciara", "seqüenciaram", "seqüenciaras", "seqüenciardes", "seqüenciarei",
  "seqüenciareis", "seqüenciarem", "seqüenciaremo", "seqüenciaremos", "seqüenciares", "seqüenciaria",
  "seqüenciariam", "seqüenciarias", "seqüenciarmo", "seqüenciarmos", "seqüenciará", "seqüenciarás",
  "seqüenciarão", "seqüenciaríamos", "seqüenciaríeis", "seqüencias", "seqüenciasse", "seqüenciassem",
  "seqüenciasses", "seqüenciaste", "seqüenciastes", "seqüenciava", "seqüenciavam", "seqüenciavas",
  "seqüencie", "seqüenciei", "seqüencieis", "seqüenciem", "seqüenciemo", "seqüenciemos",
  "seqüencies", "seqüencio", "seqüenciou", "seqüenciá", "seqüenciáramos", "seqüenciáreis",
  "seqüenciásseis", "seqüenciássemos", "seqüenciávamos", "seqüenciáveis", "seqüestra", "seqüestrada",
  "seqüestradas", "seqüestrado", "seqüestrados", "seqüestrai", "seqüestrais", "seqüestram",
  "seqüestramo", "seqüestramos", "seqüestrando", "seqüestrar", "seqüestrara", "seqüestraram",
  "seqüestraras", "seqüestrardes", "seqüestrarei", "seqüestrareis", "seqüestrarem", "seqüestraremo",
  "seqüestraremos", "seqüestrares", "seqüestraria", "seqüestrariam", "seqüestrarias", "seqüestrarmo",
  "seqüestrarmos", "seqüestrará", "seqüestrarás", "seqüestrarão", "seqüestraríamos", "seqüestraríeis",
  "seqüestras", "seqüestrasse", "seqüestrassem", "seqüestrasses", "seqüestraste", "seqüestrastes",
  "seqüestrava", "seqüestravam", "seqüestravas", "seqüestre", "seqüestrei", "seqüestreis",
  "seqüestrem", "seqüestremo", "seqüestremos", "seqüestres", "seqüestro", "seqüestros",
  "seqüestrou", "seqüestrá", "seqüestráramos", "seqüestráreis", "seqüestrásseis", "seqüestrássemos",
  "seqüestrávamos", "seqüestráveis", "seqüência", "seqüências", "subseqüente", "subseqüentemente",
  "subseqüentes", "subseqüência", "subseqüências", "tranqüila", "tranqüilamente", "tranqüilas",
  "tranqüilidade", "tranqüiliza", "tranqüilizado", "tranqüilizai", "tranqüilizais", "tranqüilizam",
  "tranqüilizamo", "tranqüilizamos", "tranqüilizando", "tranqüilizar", "tranqüilizara", "tranqüilizaram",
  "tranqüilizaras", "tranqüilizardes", "tranqüilizarei", "tranqüilizareis", "tranqüilizarem", "tranqüilizaremo",
  "tranqüilizaremos", "tranqüilizares", "tranqüilizaria", "tranqüilizariam", "tranqüilizarias", "tranqüilizarmo",
  "tranqüilizarmos", "tranqüilizará", "tranqüilizarás", "tranqüilizarão", "tranqüilizaríamos", "tranqüilizaríeis",
  "tranqüilizas", "tranqüilizasse", "tranqüilizassem", "tranqüilizasses", "tranqüilizaste", "tranqüilizastes",
  "tranqüilizava", "tranqüilizavam", "tranqüilizavas", "tranqüilize", "tranqüilizei", "tranqüilizeis",
  "tranqüilizem", "tranqüilizemo", "tranqüilizemos", "tranqüilizes", "tranqüilizo", "tranqüilizou",
  "tranqüilizá", "tranqüilizáramos", "tranqüilizáreis", "tranqüilizásseis", "tranqüilizássemos", "tranqüilizávamos",
  "tranqüilizáveis", "tranqüilo", "tranqüilos", "ungüento", "ungüentos",
]);

/** Radicais produtivos: qualquer derivado também pronuncia o u. */
const RADICAIS_TREMA = [
  "conseqüent", "trilíngüe", "eqüitativ", "cinqüent", "eloqüent", "freqüent",
  "lingüíst", "bilíngüe", "seqüestr", "tranqüil", "eqüidist", "igüidade",
  "lingüiç", "lingüet", "eqüilát", "biqüida", "verigüe", "enxagüe",
  "desagüe", "agüent", "eqüent", "inqüil", "liqüef", "qüestr",
  "seqüen", "eqüida", "azigüe", "pinqüe", "ingüim", "qüinqü",
  "sagüi",
];

/** Reinsere o trema hipotético: "cinquenta" → "cinqüenta". */
function comTremaHipotetico(palavra) {
  let saida = "";
  for (let i = 0; i < palavra.length; i++) {
    const c = palavra[i];
    if ((c === "q" || c === "g") && palavra[i + 1] === "u") {
      const prox = palavra[i + 2] ?? "";
      if ("eiéêí".includes(prox)) {
        saida += c + "ü";
        i += 1;
        continue;
      }
    }
    saida += c;
  }
  return saida;
}

/**
 * O "u" de qu/gu diante de e/i é pronunciado?
 * @param {string} palavra palavra em minúsculas, sem diacríticos além dos do pt-BR
 * @returns {boolean}
 */
export function uPronunciado(palavra) {
  if (!palavra.includes("q") && !palavra.includes("g")) return false;
  const hip = comTremaHipotetico(palavra);
  if (hip === palavra) return false;
  if (PALAVRAS_COM_TREMA.has(hip)) return true;
  return RADICAIS_TREMA.some((r) => hip.includes(r));
}
