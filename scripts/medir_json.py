#!/usr/bin/env python3
"""Saída compacta em JSON das métricas acústicas, para uso na calibração."""
import sys, json
sys.path.insert(0, "scripts")
from analisar import analisar

r = analisar(sys.argv[1])
print(json.dumps({
    "bandas": {k: float(v) for k, v in r["bandas_pct"].items()},
    "silencio": float(r["silencio_pct"]),
    "inclinacao": float(r["inclinacao_db_oitava"]) if r["inclinacao_db_oitava"] is not None else None,
    "modulacao": float(r["modulacao"]["pico_hz"]) if r["modulacao"] else None,
}))
