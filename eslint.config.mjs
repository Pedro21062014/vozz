/**
 * Configuração mínima de lint, focada em erros que quebram em runtime.
 *
 * A regra `no-undef` existe aqui por um motivo concreto: a 0.2.5 foi
 * publicada com `alvoFinal is not defined` — a declaração de uma variável
 * foi removida junto com um bloco de código, mas os usos permaneceram.
 * O erro só aparecia depois de baixar 18 MB de modelo, no navegador do
 * usuário. Um lint teria pego em milissegundos.
 */
export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        // navegador
        window: "readonly", document: "readonly", navigator: "readonly",
        self: "readonly", caches: "readonly", fetch: "readonly",
        Response: "readonly", Blob: "readonly", URL: "readonly",
        Audio: "readonly", performance: "readonly", setTimeout: "readonly",
        // comuns
        console: "readonly", globalThis: "readonly",
        TextDecoder: "readonly", TextEncoder: "readonly",
        // node
        process: "readonly", Buffer: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-const-assign": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
    },
  },
];
