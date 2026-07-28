// Gera corpus de referência com espeak-ng (oráculo) para avaliar o G2P puro-JS.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const PALAVRAS = `a o as os um uma de do da em no na por para com sem que se não sim
casa coisa tempo pessoa homem mulher menino menina criança gente povo mundo vida morte
água terra fogo ar sol lua estrela céu mar rio praia campo cidade rua praça casa porta
janela mesa cadeira cama livro papel caneta lápis carro moto ônibus trem avião navio
comida bebida pão leite café água arroz feijão carne peixe fruta banana maçã laranja
trabalho escola faculdade professor aluno médico enfermeira advogado juiz polícia
amor ódio medo raiva alegria tristeza saudade esperança fé sorte azar
grande pequeno alto baixo gordo magro bonito feio novo velho jovem antigo
bom mau melhor pior maior menor muito pouco mais menos todo nada
falar dizer fazer ser estar ter haver ir vir dar ver saber poder querer dever
comer beber dormir acordar andar correr pular nadar voar cantar dançar tocar
vermelho azul verde amarelo preto branco cinza rosa roxo laranja marrom
segunda terça quarta quinta sexta sábado domingo
janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro
coração razão nação canção informação educação população situação
trabalho filho filha velho olho milho joelho espelho conselho
vinho sonho banho tenho venho ganho caminho carinho vizinho
carro terra guerra bairro socorro cachorro ferro barro
brasil brasileiro português portuguesa espanhol francês inglês alemão japonês
computador telefone celular internet programa sistema arquivo
possível impossível difícil fácil útil rápido lento simples
história memória vitória glória fábrica música lógica prática
exemplo exato exame texto próximo máximo sexta táxi peixe caixa baixo
hoje ontem amanhã agora depois antes sempre nunca ainda já
aqui ali lá onde quando como quem qual quanto porque
obrigado obrigada desculpa favor licença parabéns
feliz triste cansado animado calmo nervoso tranquilo
primeiro segundo terceiro quarto quinto último
noite tarde manhã dia semana mês ano século
cabeça braço perna mão pé olho boca nariz orelha dente
`.split(/\s+/).filter(Boolean);

const FRASES = [
  "Olá, tudo bem com você?",
  "O rato roeu a roupa do rei de Roma.",
  "Hoje o dia está muito bonito aqui em São Paulo.",
  "Eu gosto de programar em JavaScript no navegador.",
  "A inteligência artificial mudou o mundo da tecnologia.",
  "Meu nome é Dora e eu falo português do Brasil.",
  "Vamos almoçar juntos amanhã de manhã?",
  "O trabalho dele é muito importante para a empresa.",
  "As crianças brincam felizes no parque da cidade.",
  "Preciso comprar pão, leite e café no mercado.",
  "Ela trabalha como professora numa escola pública.",
  "Não consigo acreditar que já é sexta-feira!",
  "A música brasileira é conhecida no mundo inteiro.",
  "Você poderia me ajudar com esse problema, por favor?",
  "O coração dela bateu forte naquele momento.",
];

const itens = [...new Set(PALAVRAS)].map((w) => ({ tipo: "palavra", texto: w }));
for (const f of FRASES) itens.push({ tipo: "frase", texto: f });

const out = [];
for (const it of itens) {
  try {
    const ipa = execFileSync("espeak-ng", ["-v", "pt-br", "-q", "--ipa", it.texto], {
      encoding: "utf8",
    }).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    out.push({ ...it, esperado: ipa });
  } catch (e) { /* ignora */ }
}
writeFileSync(new URL("../test/corpus.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("corpus:", out.length, "itens");
