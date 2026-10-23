"""Testes da camada de diagnóstico (eventos com contexto, baselines, detector). Não precisam da base real."""
import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from roundrx.config import load_config
from roundrx.fundamentals.baselines import CellModel, fit_trade_baselines
from roundrx.fundamentals.events import build_advantage_episodes, build_death_events, build_fb_events
from roundrx.fundamentals.patterns import detect_patterns, label
from roundrx.metrics.base import Context
from roundrx.validation import synthetic_match


@pytest.fixture(scope="module")
def cfg():
    return load_config()


@pytest.fixture(scope="module")
def synthetic_deaths(cfg):
    from roundrx.pipeline import compute
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / "Univavá" / "Classificatória 1"
        d.mkdir(parents=True)
        (d / "UNIVAVA_C1_999_01-01-26_time_vermelho_2_x_1_time_azul_ascent.json").write_text(json.dumps(synthetic_match()), encoding="utf-8")
        res = compute(cfg, data_dir=Path(tmp), quiet=True)
    t = {k.split("/", 1)[1]: v for k, v in res.items() if k.startswith("canonical/")}
    ctx = Context(t, res["derived/round_events"], res["derived/trades"], res["derived/team_rounds"], cfg)
    return build_death_events(ctx), res


@pytest.fixture(scope="module")
def synthetic_adv(cfg, synthetic_deaths):
    _, res = synthetic_deaths
    t = {k.split("/", 1)[1]: v for k, v in res.items() if k.startswith("canonical/")}
    ctx = Context(t, res["derived/round_events"], res["derived/trades"], res["derived/team_rounds"], cfg)
    return build_advantage_episodes(ctx), res


@pytest.fixture(scope="module")
def synthetic_fb(cfg, synthetic_deaths):
    _, res = synthetic_deaths
    t = {k.split("/", 1)[1]: v for k, v in res.items() if k.startswith("canonical/")}
    ctx = Context(t, res["derived/round_events"], res["derived/trades"], res["derived/team_rounds"], cfg)
    return build_fb_events(ctx), res


def test_fb_events_match_opn01_opn03(synthetic_fb):
    fb, res = synthetic_fb
    mr = res["metrics_round"]
    o1, o3 = mr[mr["metric_id"] == "OPN-01"], mr[mr["metric_id"] == "OPN-03"]
    assert len(fb) == int(o1["den"].sum()) and int(fb["got_fb"].sum()) == int(o1["num"].sum())
    rec = fb[fb["eligible_rec"]]
    assert len(rec) == int(o3["den"].sum()) and int(rec["won"].sum()) == int(o3["num"].sum())
    # exatamente um time faz o FB em cada round
    assert (fb.groupby(["match_id", "round_num"])["got_fb"].sum() == 1).all()


def test_fb_event_details(synthetic_fb):
    fb, _ = synthetic_fb
    r0 = fb[fb["round_num"] == 0].set_index("team_id")
    # r0: B1 mata R1 aos 20 s -> Blue faz o FB com B1; Red sofre com R1 (e mesmo assim vence o round)
    assert r0.loc["Blue", "got_fb"] and r0.loc["Blue", "duel_player"] == "B1" and abs(r0.loc["Blue", "t_s"] - 20) < 1e-9
    assert not r0.loc["Red", "got_fb"] and r0.loc["Red", "duel_player"] == "R1" and r0.loc["Red", "eligible_rec"]
    assert r0.loc["Red", "fb_traded"] and abs(r0.loc["Red", "revenge_s"] - 2) < 1e-9
    assert r0.loc["Red", "when"] == "15–35 s" and r0.loc["Red", "duel_role"] != "?"


def test_fb_contract(synthetic_fb):
    from roundrx.fundamentals.contracts import FirstBloodEvent, required_columns
    assert set(required_columns(FirstBloodEvent)) <= set(synthetic_fb[0].columns)


def test_fb_labels():
    from roundrx.fundamentals.patterns import fbo_label, fbr_label
    assert fbo_label({}) == "Duelos de abertura"
    assert fbo_label({"duel_role": "Duelista", "side": "def"}) == "Duelos de abertura de duelistas na defesa"
    assert fbr_label({"when": "até 15 s", "map_name": "Ascent"}) == "Rounds depois de sofrer o first blood nos primeiros 15 s, em Ascent"


def test_baseline_excludes_all_matches_of_the_team(cfg):
    """O adversário de T0 nas partidas de T0 também fica fora do ajuste do esperado de T0 (desfechos espelhados)."""
    from roundrx.fundamentals.patterns import _Override
    cfg = _Override(cfg)
    cfg.cfg.raw["fundamentals"]["baseline"]["model"] = "M2_logistic"
    d = _toy()
    t1 = d["team_name"] == "T1"
    d.loc[t1, "match_id"] = d.loc[t1, "match_id"].str.replace("T1-", "T0-")  # T1 joga as partidas de T0
    d.loc[t1, "kill_idx"] += 1000  # kills distintas dentro da mesma partida
    a, _ = fit_trade_baselines(d, cfg)
    flipped = d.copy()
    flipped.loc[t1, "traded_5s"] = ~flipped.loc[t1, "traded_5s"]
    b, _ = fit_trade_baselines(flipped, cfg)
    cfg.cfg.raw["fundamentals"]["baseline"]["model"] = "auto"
    t0 = d["team_name"] == "T0"
    assert np.allclose(a.loc[t0, "exp_trade_5s"], b.loc[t0, "exp_trade_5s"])
    t2 = d["team_name"] == "T2"
    assert not np.allclose(a.loc[t2, "exp_trade_5s"], b.loc[t2, "exp_trade_5s"])


def test_advantage_episodes_match_dyn01(synthetic_adv):
    a, res = synthetic_adv
    d1 = res["metrics_round"]
    d1 = d1[(d1["metric_id"] == "DYN-01") & (d1["stratum"] == "+1")]
    assert len(a) == int(d1["den"].sum()) and int(a["won"].sum()) == int(d1["num"].sum())


def test_advantage_episode_details(synthetic_adv):
    a, _ = synthetic_adv
    red = a[a["team_id"] == "Red"].set_index("round_num")
    # r0: Red só passa à frente aos 61 s (3v2) e vence
    assert red.loc[0, "state"] == "3v2" and abs(red.loc[0, "t0_s"] - 61) < 1e-9 and red.loc[0, "won"]
    # r2: 5v4 aos 10 s; B5 mata os 5 (30–34 s): perde a vantagem aos 33 s, colapso, 5 mortes sem resposta, derrota
    r2 = red.loc[2]
    assert r2["state"] == "5v4" and r2["lost_adv"] and abs(r2["held_s"] - 23) < 1e-9
    assert r2["collapse"] and r2["unanswered"] == 5 and not r2["won"]
    blue = a[a["team_id"] == "Blue"].set_index("round_num")
    assert blue.loc[0, "state"] == "5v4" and blue.loc[0, "lost_adv"] and abs(blue.loc[0, "held_s"] - 2) < 1e-9
    assert blue.loc[2, "state"] == "1v0" and not blue.loc[2, "eligible"]  # adversário sem ninguém: fora da análise


def test_death_events_one_row_per_enemy_kill(synthetic_deaths):
    de, res = synthetic_deaths
    k = res["canonical/kills"]
    assert len(de) == int(((k["kill_type"] == "enemy") & k["in_play"]).sum())


def test_trade_windows_are_monotonic_and_match_trd01(synthetic_deaths):
    de, res = synthetic_deaths
    assert (de["traded_3s"] <= de["traded_5s"]).all() and (de["traded_5s"] <= de["traded_7s"]).all()
    # janela de 4 s reproduz a tabela de trades usada por TRD-01
    tr = res["derived/trades"].set_index(["match_id", "round_num", "kill_idx"])["traded"]
    got = (de.set_index(["match_id", "round_num", "kill_idx"])["revenge_s"] <= 4).fillna(False)
    assert (got == tr.reindex(got.index).fillna(False).astype(bool)).all()
    # r0: B1 mata R1 aos 20 s e R2 troca aos 22 s -> trocada em 2 s
    r1 = de[(de["round_num"] == 0) & (de["victim"] == "R1")].iloc[0]
    assert r1["traded_3s"] and abs(r1["revenge_s"] - 2.0) < 1e-9


def test_last_alive_death_is_not_eligible(synthetic_deaths):
    de, _ = synthetic_deaths
    # r1: R1 mata os 5 do Blue; a morte de B5 (último vivo) não pode ser trocada
    b5 = de[(de["round_num"] == 1) & (de["victim"] == "B5")].iloc[0]
    assert b5["alive_before"] == 1 and not b5["eligible"]
    assert de.loc[de["eligible"], "allies_alive"].min() >= 1


def _toy(n_teams=6, n_matches=8, per_match=60, seed=0, plant=None):
    rng = np.random.default_rng(seed)
    windows = load_config()["fundamentals"]["trade_windows_s"]
    rows = []
    for t in range(n_teams):
        for m in range(n_matches):
            for e in range(per_match):
                dist = rng.choice(["≤ 5 m", "5–10 m", "10–20 m", "> 30 m"])
                p = {"≤ 5 m": 0.45, "5–10 m": 0.35, "10–20 m": 0.25, "> 30 m": 0.05}[dist]
                y = rng.random() < p
                if plant is not None and t == plant and dist == "5–10 m":
                    y = rng.random() < 0.05
                rows.append({"team_name": f"T{t}", "match_id": f"T{t}-M{m}", "round_num": e // 6, "kill_idx": e,
                             "game_start_ms": m, "series_key": f"S{t}-{m // 2}", "eligible": True,
                             "ally_dist": dist, "allies_near_b": "1", "phase": "pré-plant", "numbers": "igualdade",
                             "side": rng.choice(["atk", "def"]), "economy": "equipamento equilibrado", "killer_to_ally_cm": 1500.0,
                             "map_name": rng.choice(["Ascent", "Haven"]), "fb_context": "time fez o FB",
                             "victim_name": f"P{t}{e % 5}", "nearest_ally_name": f"P{t}{(e + 1) % 5}",
                             **{f"traded_{w}s": y for w in windows}})
    return pd.DataFrame(rows)


def test_baseline_never_uses_the_team_itself(cfg):
    """Com a classe de modelo fixada, o esperado de um time não muda quando os desfechos DELE mudam.
    (No modo automático, a escolha da classe de modelo é uma decisão global feita na validação por série.)"""
    from roundrx.fundamentals.patterns import _Override
    cfg = _Override(cfg)
    cfg.cfg.raw["fundamentals"]["baseline"]["model"] = "M2_logistic"
    d = _toy()
    a, _ = fit_trade_baselines(d, cfg)
    flipped = d.copy()
    mine = flipped["team_name"] == "T0"
    flipped.loc[mine, "traded_5s"] = ~flipped.loc[mine, "traded_5s"]
    b, _ = fit_trade_baselines(flipped, cfg)
    cfg.cfg.raw["fundamentals"]["baseline"]["model"] = "auto"
    assert np.allclose(a.loc[mine, "exp_trade_5s"], b.loc[mine, "exp_trade_5s"])      # o próprio time não entra
    assert not np.allclose(a.loc[~mine, "exp_trade_5s"], b.loc[~mine, "exp_trade_5s"])  # os outros usam T0


def test_cell_model_shrinks_rare_cells_to_parent():
    X = pd.DataFrame({"a": ["x"] * 100 + ["y"], "b": ["u"] * 101})
    y = np.r_[np.zeros(50), np.ones(50), [1.0]]
    m = CellModel(["a", "b"], m=20).fit(X, y)
    p = m.predict(pd.DataFrame({"a": ["y"], "b": ["u"]}))[0]
    assert 0.5 < p < 0.6  # 1 acerto em 1 evento não vira 100%: fica perto da média do pai


def test_detector_finds_planted_deficit_and_not_others(cfg):
    d, _ = fit_trade_baselines(_toy(plant=0, seed=3), cfg)
    pt = detect_patterns(d, cfg, z_star=3.5)
    sel = pt[(pt["scope"] == "todas") & pt["selected"]]
    assert sel["team"].eq("T0").any() and sel[sel["team"] == "T0"]["dims"].str.contains("5–10 m").any()
    assert sel[sel["team"] != "T0"].empty
    # somas do recorte geral batem com os eventos
    g = pt[(pt["scope"] == "todas") & (pt["level"] == 0) & (pt["team"] == "T1")].iloc[0]
    e = d[d["team_name"] == "T1"]
    assert g["n_events"] == len(e) and abs(g["observed"] - e["traded_5s"].mean()) < 1e-12


def test_labels_are_review_language():
    assert label({}) == "Mortes com aliado vivo"
    assert label({"side": "def", "ally_dist": "5–10 m"}) == "Mortes na defesa com o aliado mais próximo a 5–10 m"


def test_contracts_match_tables(synthetic_deaths, cfg):
    from roundrx.fundamentals.contracts import DetectedPattern, TeamRoundState, required_columns
    de, _ = synthetic_deaths
    assert set(required_columns(TeamRoundState)) <= set(de.columns)
    d, _ = fit_trade_baselines(_toy(plant=0, seed=3), cfg)
    pt = detect_patterns(d, cfg, z_star=3.5)
    assert set(required_columns(DetectedPattern)) <= set(pt.columns)
