"""Testes rápidos (não precisam da base real): `python -m pytest -q`."""
import json
from pathlib import Path

import pandas as pd
import pytest

from roundrx.config import load_config
from roundrx.ingest import parse_filename
from roundrx.metrics import REGISTRY
from roundrx.validation import run_scenario, synthetic_match


@pytest.fixture(scope="module")
def cfg():
    return load_config()


def test_filename_parser():
    m = parse_filename("UNIVAVA_G_001a_19-09-26_azure_bears_golden_9_x_13_green_owls_jacurutu_split")
    assert m["parse_ok"] and m["team_a"] == "azure_bears_golden" and m["team_b"] == "green_owls_jacurutu"
    assert (m["score_a"], m["score_b"], m["map_token"], m["stage"]) == (9, 13, "split", "Fase de Grupos")
    m = parse_filename("RUSH_INCLUSIVO_014b_08-08-26_caap_auroras_7_x_13_macklogic_rainbow_haven")
    assert m["competition"] == "Rush Series" and m["date"] == "2026-08-08"


def test_registry_matches_dictionary(cfg):
    d = pd.read_csv(cfg.dictionary_path, sep=";", encoding="utf-8-sig")
    ids = set(d["id"])
    assert set(REGISTRY) <= ids, f"métricas fora do dicionário: {set(REGISTRY) - ids}"
    missing = set(d.loc[d["classe"] != "M", "id"]) - set(REGISTRY)
    assert not missing, f"métricas D/R/P sem implementação: {missing}"


def test_synthetic_scenario(cfg):
    sc = run_scenario(cfg)
    failed = sc[~sc["passou"]]
    assert failed.empty, failed.to_string()


def test_synthetic_json_is_valid():
    j = synthetic_match()
    json.dumps(j)
    assert len(j["players"]) == 10 and len(j["roundResults"]) == 3
