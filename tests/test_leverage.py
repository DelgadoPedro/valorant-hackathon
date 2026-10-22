"""Modelo de pressão: P(vencer o mapa) pela cadeia de Markov do placar."""
import itertools
import random

import pytest

from roundrx.leverage import g_state, p_tie
from roundrx.validation import _wp_forward


def test_symmetric_start_is_half():
    assert g_state(0, 0, 0, True, True, 0.5) == pytest.approx(0.5)


def test_mirror_sums_to_one():
    for pa in (0.35, 0.52, 0.61):
        for a, b in itertools.product(range(13), range(13)):
            k = a + b
            if k >= 24 or (a == 12 and b == 12):
                continue
            team = g_state(a, b, k, True, True, pa)
            opp = g_state(b, a, k, False, False, pa)
            assert team + opp == pytest.approx(1.0)


def test_terminal_and_tie():
    assert g_state(13, 7, 20, True, True, 0.5) == 1.0
    assert g_state(9, 13, 22, True, True, 0.5) == 0.0
    assert p_tie(0.6, 0.4) == pytest.approx(0.5)  # entre times médios a prorrogação é 50%
    assert g_state(14, 12, 26, True, True, 0.6) == 1.0
    assert g_state(13, 12, 25, True, True, 0.6) == pytest.approx(0.6 + 0.4 * 0.5)


def test_monotone_in_score():
    for k in range(1, 20):
        for a in range(0, min(k, 12)):
            b = k - a
            if b > 12 or a + 1 > 12:
                continue
            assert g_state(a + 1, b - 1, k, True, True, 0.53) >= g_state(a, b, k, True, True, 0.53)


def test_matches_independent_forward_dp():
    random.seed(1)
    for _ in range(200):
        pa = random.uniform(0.3, 0.7)
        k = random.randint(0, 23)
        a = random.randint(max(0, k - 12), min(12, k))
        b = k - a
        if b > 12 or (a == 12 and b == 12):
            continue
        fa = random.random() < 0.5
        assert g_state(a, b, k, fa, True, pa) == pytest.approx(_wp_forward(a, b, k, fa, pa), abs=1e-12)
