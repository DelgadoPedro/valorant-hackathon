"""Evidence follows the diagnosis direction, including strong overall results."""
from types import SimpleNamespace

import pandas as pd
import pytest

from roundrx.fundamentals.evidence import build_evidence


@pytest.mark.parametrize("level,tier", [(0, "padrão"), (0, ""), (1, "padrão")])
@pytest.mark.parametrize("direction", ["acima", "abaixo"])
def test_evidence_supports_the_pattern_direction(level, tier, direction):
    spec = SimpleNamespace(name="keyrounds", eligible="eligible", y="won", p="exp_key")
    events = pd.DataFrame([
        {"match_id": "M1", "team_id": "Red", "team_name": "Strong team", "round_num": i,
         "game_start_ms": 0, "eligible": True, "won": won, "exp_key": expected,
         "side": "atk", "map_name": "Ascent", "round_type": "armado", "economy": "equipamento equilibrado"}
        for i, (won, expected) in enumerate([(True, .8), (False, .4), (True, .3), (False, .9)])
    ])
    patterns = pd.DataFrame([{
        "pattern_id": "pattern", "fundamental": "keyrounds", "team": "Strong team", "scope": "todas",
        "tier": tier, "level": level, "direction": direction,
        "dims": "{}" if level == 0 else '{"side": "atk"}',
    }])

    evidence = build_evidence(events, patterns, {"fundamentals": {"default_window_s": 4}}, spec)

    expected_outcome = direction == "acima"
    assert evidence["outcome"].tolist() == [expected_outcome, expected_outcome]
    assert evidence["round_num"].tolist() == ([2, 0] if expected_outcome else [3, 1])
    assert evidence["why_listed"].str.contains("venceu o round" if expected_outcome else "perdeu o round").all()


def test_perfect_overall_result_keeps_successful_evidence():
    spec = SimpleNamespace(name="keyrounds", eligible="eligible", y="won", p="exp_key")
    events = pd.DataFrame([{
        "match_id": "M1", "team_id": "Red", "team_name": "Strong team", "round_num": 0,
        "game_start_ms": 0, "eligible": True, "won": True, "exp_key": .5,
        "side": "atk", "map_name": "Ascent", "round_type": "armado", "economy": "equipamento equilibrado",
    }])
    patterns = pd.DataFrame([{
        "pattern_id": "pattern", "fundamental": "keyrounds", "team": "Strong team", "scope": "todas",
        "tier": "padrão", "level": 0, "direction": "acima", "dims": "{}",
    }])

    evidence = build_evidence(events, patterns, {"fundamentals": {"default_window_s": 4}}, spec)

    assert len(evidence) == 1
    assert evidence.iloc[0]["outcome"]
