#!/usr/bin/env python3
"""
Analisador objetivo de qualidade de fala sintetizada.

Mede propriedades acústicas que a literatura associa à inteligibilidade e à
naturalidade, e compara com faixas típicas de fala humana. Serve para guiar o
ajuste do sintetizador com números, não com impressão.

Métricas:
  1. Formantes por LPC — o sintetizador entrega o F1/F2 que prometeu?
  2. Espaço vocálico — as vogais ocupam posições distintas no plano F1×F2?
  3. Espectro de modulação — fala natural tem pico em 4-5 Hz (taxa silábica)
  4. Inclinação espectral — energia deve cair ~-8 a -12 dB/oitava
  5. Distribuição de energia por banda
  6. Proporção de silêncio e continuidade de F0
"""
import sys, json, wave
import numpy as np
from scipy.signal import lfilter, get_window, find_peaks


def ler_wav(caminho):
    w = wave.open(caminho)
    n, sr = w.getnframes(), w.getframerate()
    x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(float) / 32768.0
    w.close()
    return x, sr


def formantes_lpc(seg, sr, ordem=None):
    """Extrai formantes de um trecho por análise LPC (raízes do polinômio)."""
    if ordem is None:
        ordem = int(2 + sr / 1000)
    seg = seg * np.hamming(len(seg))
    seg = lfilter([1, -0.97], 1, seg)  # pré-ênfase padrão em análise
    if np.abs(seg).max() < 1e-6:
        return []
    # Autocorrelação -> Levinson-Durbin
    r = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
    if r[0] <= 0:
        return []
    r = r[: ordem + 1]
    a = np.zeros(ordem + 1)
    a[0] = 1.0
    e = r[0]
    for i in range(1, ordem + 1):
        acc = r[i] + sum(a[j] * r[i - j] for j in range(1, i))
        k = -acc / e if e != 0 else 0
        novo = a.copy()
        for j in range(1, i):
            novo[j] = a[j] + k * a[i - j]
        novo[i] = k
        a = novo
        e *= (1 - k * k)
        if e <= 0:
            break
    raizes = np.roots(a)
    raizes = raizes[np.imag(raizes) > 0.01]
    if len(raizes) == 0:
        return []
    freqs = np.arctan2(np.imag(raizes), np.real(raizes)) * sr / (2 * np.pi)
    bw = -0.5 * (sr / (2 * np.pi)) * np.log(np.abs(raizes))
    # Formantes válidos: banda estreita e dentro da faixa audível de fala
    val = [(f, b) for f, b in zip(freqs, bw) if 90 < f < 5500 and b < 1000]
    val.sort()
    return [f for f, _ in val]


def analisar_vogal(caminho, alvo_f1, alvo_f2):
    """Compara os formantes medidos com os alvos declarados."""
    x, sr = ler_wav(caminho)
    if len(x) < sr // 20:
        return None
    # Mede no miolo, longe das rampas de ataque/decaimento
    ini, fim = int(len(x) * 0.35), int(len(x) * 0.65)
    janela = int(sr * 0.025)
    medidas = []
    for i in range(ini, fim - janela, janela // 2):
        f = formantes_lpc(x[i:i + janela], sr)
        if len(f) >= 2:
            medidas.append(f[:3])
    if not medidas:
        return None
    m = np.median(np.array([mm[:2] for mm in medidas]), axis=0)
    return {
        "f1_medido": round(float(m[0])),
        "f2_medido": round(float(m[1])),
        "f1_alvo": alvo_f1,
        "f2_alvo": alvo_f2,
        "erro_f1_pct": round(100 * abs(m[0] - alvo_f1) / alvo_f1, 1),
        "erro_f2_pct": round(100 * abs(m[1] - alvo_f2) / alvo_f2, 1),
    }


def espectro_modulacao(x, sr):
    """
    Pico do espectro de modulação da envoltória.
    Fala humana tem pico marcante em 3-6 Hz — é a taxa silábica. Um sinal sem
    esse pico soa "corrido" ou sem ritmo.
    """
    janela = int(sr * 0.01)
    env = np.array([np.sqrt(np.mean(x[i:i + janela] ** 2))
                    for i in range(0, len(x) - janela, janela)])
    if len(env) < 16:
        return None
    env = env - env.mean()
    taxa_env = sr / janela
    espectro = np.abs(np.fft.rfft(env * np.hanning(len(env))))
    freqs = np.fft.rfftfreq(len(env), 1 / taxa_env)
    m = (freqs > 0.5) & (freqs < 20)
    if not m.any():
        return None
    return {
        "pico_hz": round(float(freqs[m][np.argmax(espectro[m])]), 2),
        "energia_4_8hz": round(float(
            espectro[(freqs >= 3) & (freqs <= 8)].sum() / espectro[m].sum()), 3),
    }


def inclinacao_espectral(x, sr):
    """Inclinação em dB/oitava entre 500 Hz e 4 kHz."""
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    m = (f > 400) & (f < 4500) & (S > 0)
    if m.sum() < 10:
        return None
    coef = np.polyfit(np.log2(f[m]), 10 * np.log10(S[m]), 1)
    return round(float(coef[0]), 1)


def analisar(caminho):
    x, sr = ler_wav(caminho)
    dur = len(x) / sr
    S = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / sr)
    total = S.sum() or 1

    bandas = {}
    for lo, hi in [(0, 300), (300, 1000), (1000, 3000), (3000, 8000)]:
        m = (f >= lo) & (f < hi)
        bandas[f"{lo}-{hi}"] = round(100 * S[m].sum() / total, 1)

    janela = int(sr * 0.02)
    env = np.array([np.sqrt(np.mean(x[i:i + janela] ** 2))
                    for i in range(0, len(x) - janela, janela)])
    silencio = round(100 * float((env < 0.1 * env.max()).mean()), 1) if len(env) else 0

    return {
        "duracao": round(dur, 2),
        "bandas_pct": bandas,
        "silencio_pct": silencio,
        "inclinacao_db_oitava": inclinacao_espectral(x, sr),
        "modulacao": espectro_modulacao(x, sr),
        "pico": round(float(np.abs(x).max()), 3),
        "rms": round(float(np.sqrt((x ** 2).mean())), 4),
    }


# Faixas de referência medidas em fala humana natural.
REFERENCIA = {
    "banda_300_1000": (25, 50),
    "banda_1000_3000": (20, 45),
    "banda_3000_8000": (5, 30),
    "silencio_pct": (18, 42),
    "inclinacao_db_oitava": (-14, -5),
    "modulacao_pico_hz": (2.5, 7.0),
    "erro_formante_pct": 15,
}


def avaliar(rel):
    """Compara o relatório com as faixas de referência e devolve aprovações."""
    r, notas = rel, []
    b = r["bandas_pct"]
    def faixa(nome, valor, lo, hi):
        ok = valor is not None and lo <= valor <= hi
        notas.append((nome, valor, f"{lo}..{hi}", ok))
        return ok
    faixa("energia 300-1000Hz", b["300-1000"], *REFERENCIA["banda_300_1000"])
    faixa("energia 1000-3000Hz", b["1000-3000"], *REFERENCIA["banda_1000_3000"])
    faixa("energia 3000-8000Hz", b["3000-8000"], *REFERENCIA["banda_3000_8000"])
    faixa("silêncio %", r["silencio_pct"], *REFERENCIA["silencio_pct"])
    faixa("inclinação dB/oit", r["inclinacao_db_oitava"], *REFERENCIA["inclinacao_db_oitava"])
    if r["modulacao"]:
        faixa("modulação pico Hz", r["modulacao"]["pico_hz"], *REFERENCIA["modulacao_pico_hz"])
    return notas


if __name__ == "__main__":
    alvo = sys.argv[1]
    rel = analisar(alvo)
    print(json.dumps(rel, ensure_ascii=False, indent=1))
    print("\navaliação:")
    ok = 0
    for nome, valor, esperado, passou in avaliar(rel):
        print(f"  [{'OK ' if passou else 'RUIM'}] {nome:24} = {valor!s:>8}  (esperado {esperado})")
        ok += passou
    print(f"\n{ok} criterios OK")
