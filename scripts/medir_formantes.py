#!/usr/bin/env python3
"""Mede F1/F2 de um arquivo de vogal sustentada, por LPC. Saída em JSON."""
import sys, json
import numpy as np
sys.path.insert(0, "scripts")
from analisar import ler_wav, formantes_lpc

x, sr = ler_wav(sys.argv[1])
ini, fim = int(len(x) * 0.35), int(len(x) * 0.70)
janela = int(sr * 0.025)
medidas = []
for i in range(ini, max(ini + 1, fim - janela), janela // 2):
    f = formantes_lpc(x[i:i + janela], sr)
    if len(f) >= 2:
        medidas.append(f[:2])

if medidas:
    m = np.median(np.array(medidas), axis=0)
    print(json.dumps({"f1": int(round(m[0])), "f2": int(round(m[1]))}))
else:
    print(json.dumps({"f1": None, "f2": None}))
