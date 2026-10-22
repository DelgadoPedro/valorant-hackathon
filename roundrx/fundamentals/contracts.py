"""Contratos de dados da camada de diagnóstico (ver documento de arquitetura).

Cada contrato corresponde a colunas das tabelas em outputs/: o teste `tests/test_fundamentals.py` confere que as
colunas obrigatórias existem. Observado e estimado ficam em campos separados.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

Side = Literal["atk", "def"]
TeamId = Literal["Red", "Blue"]          # cor no JSON; muda entre partidas


@dataclass(frozen=True)
class Match:
    match_id: str
    file: str
    competition: str
    stage: str
    series: str
    date: str
    map_name: str
    red_name: str
    blue_name: str
    red_score: int
    blue_score: int
    n_rounds: int


@dataclass(frozen=True)
class Round:
    match_id: str
    round_num: int              # 0-based
    half: int
    atk_team: TeamId
    winning_team: TeamId
    result: str
    plant_time_ms: Optional[float]
    plant_site: Optional[str]
    defuse_time_ms: Optional[float]


@dataclass(frozen=True)
class KillEvent:
    match_id: str
    round_num: int
    kill_idx: int
    t_ms: float
    killer: str
    victim: str
    killer_team: TeamId
    victim_team: TeamId
    kill_type: Literal["enemy", "team", "self", "bomb"]
    in_play: bool
    assistants: str             # puuids separados por vírgula
    victim_x: Optional[float]
    victim_y: Optional[float]
    snapshot_n: int


@dataclass(frozen=True)
class TeamRoundState:
    """Estado do time da vítima no instante da morte avaliada (colunas de death_events)."""
    match_id: str
    round_num: int
    team_name: str
    side: Side
    t_s: float
    alive_before: int
    opp_alive: int
    spike: str                  # "plantada" | "não plantada"
    team_loadout: float
    opp_loadout: float
    fb_context: str


@dataclass(frozen=True)
class FirstBloodEvent:
    """Linha de fb_events: um time num round com first blood (duas linhas por round)."""
    match_id: str
    round_num: int
    team_id: TeamId
    team_name: str
    side: Side
    map_name: str
    economy: str
    t_s: float                  # segundos de jogo no round, como o JSON registra
    when: str
    duel_player: str            # do time: quem matou (fez o FB) ou quem morreu (sofreu)
    duel_role: str
    got_fb: bool
    won: bool
    eligible_rec: bool          # sofreu o FB: entra na recuperação


@dataclass(frozen=True)
class TeamMetric:
    metric_id: str
    team_name: str
    stratum: str
    num: float
    den: float
    n_matches: int


@dataclass(frozen=True)
class ContextualBaseline:
    """Linha de outputs/fundamentals/baseline_report."""
    fundamental: str
    model: str
    log_loss: float
    brier: float
    ece: float
    window_s: int
    chosen: bool
    n_events: int
    n_series: int


@dataclass(frozen=True)
class DetectedPattern:
    """Linha de outputs/fundamentals/patterns (selected = exibido como padrão)."""
    pattern_id: str
    fundamental: str
    scope: str
    team: str
    dims: str                   # JSON {dimensão: valor}
    level: int
    label: str
    direction: Literal["abaixo", "acima"]
    observed: float
    expected: float
    gap_pp: float
    ci_lo_pp: float
    ci_hi_pp: float
    events_vs_expected: float
    n_events: int
    n_matches: int
    recurrence: float
    n_rec_matches: int
    z: float
    z_star: float
    selected: bool
    parent_dims: str
    window_s: int
    model: str


@dataclass(frozen=True)
class SupportingEvidence:
    """Linha de outputs/fundamentals/evidence."""
    pattern_id: str
    rank: int
    match_id: str
    round_num: int
    kill_idx: int
    t_s: float
    expected: float
    outcome: bool
    victim: Optional[str]
    killer: Optional[str]
    nearest_ally: Optional[str]
    nearest_ally_m: Optional[float]
    state: str
    why_listed: str
    extra: dict = field(default_factory=dict, compare=False)


def required_columns(cls) -> list[str]:
    return [f for f in cls.__dataclass_fields__ if f != "extra"]
