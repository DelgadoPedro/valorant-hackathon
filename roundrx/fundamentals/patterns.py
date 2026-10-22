"""Detector de padrões recorrentes: recortes de contexto em que o time fica abaixo (ou acima) do esperado.

Para cada time × conjunto de partidas × recorte (uma dimensão de contexto, ou um par de dimensões):
  n            eventos (mortes com aliado vivo)
  observado    Σy / n                     (y = trocada na janela padrão)
  esperado     Σp / n                     (p = esperado leave-one-team-out, ver baselines.py)
  diferença    observado − esperado (pontos)
  vs_esperado  Σ(y − p): trades a mais (+) ou a menos (−) do que times parecidos fariam nessas mesmas situações
  z            Σ(y − p) / √Σp(1 − p)
  IC           percentis do bootstrap de PARTIDAS (eventos do mesmo mapa não são independentes)
  recorrência  fração das partidas (com ≥ min_events_per_match no recorte) do mesmo lado do esperado

Limiar de evidência calibrado por simulação nula (sem regra arbitrária): sorteamos os desfechos de todos os times a
partir do próprio esperado (nenhum padrão real existe) e escolhemos z* tal que, nesses dados, no máximo
`null_team_rate` dos times teria ALGUM recorte com |z| ≥ z*. Isso já desconta as centenas de recortes testados por
time e a correlação entre eles.

Critérios de exibição (config `fundamentals.patterns`), sem score composto: n ≥ min_events, partidas ≥ min_matches,
|z| ≥ z*, IC que não cruza zero e recorrência ≥ min_recurrence. Ordem: |Σ(y − p)|.

Sinais a observar: recortes que passam em tudo menos no limiar z* (|z| ≥ `watch_z`). Aparecem separados, com o
aviso de que a amostra ainda não sustenta um padrão; a validação nula mede quantos times os teriam por acaso.

Hierarquia: o recorte "todas as mortes" (nível 0) é o padrão geral do time. Quando ele já é um padrão, um recorte
mais específico só aparece se CONCENTRA o problema (diferença ≥ `min_excess_pp` mais extrema que a geral); um par de
dimensões só aparece se for ≥ `min_excess_pp` mais extremo que os recortes simples que o contêm e que já são padrão.
"""
from __future__ import annotations

import json
from itertools import combinations

import numpy as np
import pandas as pd
from scipy.stats import norm

# dimensões de contexto testadas, com o nome mostrado ao coach
DIMS = {
    "side": "lado", "map_name": "mapa", "phase": "momento do round", "numbers": "número de jogadores",
    "ally_dist": "distância do aliado mais próximo", "allies_near_b": "aliados a até 15 m", "economy": "economia",
    "fb_context": "first blood", "victim_name": "jogador que morreu", "nearest_ally_name": "aliado mais próximo",
}
PAIR_DIMS = ["side", "phase", "ally_dist", "allies_near_b", "numbers", "map_name"]
# a 1ª vantagem do round sempre nasce de uma kill (saldo 0 -> +1), então "margem" e "veio do first blood" repetem a
# situação (5v4 = first blood do time) e ficam fora dos recortes
ADV_DIMS = {"state": "situação", "side": "lado", "map_name": "mapa", "spike": "spike", "when": "quando começou",
            "economy": "economia"}
ADV_PAIR_DIMS = ["state", "side", "spike", "when", "map_name"]


def phrase(dim: str, v: str) -> str:
    """Trecho de frase legível para um valor de contexto."""
    if dim == "side":
        return "no ataque" if v == "atk" else "na defesa"
    if dim == "map_name":
        return f"em {v}"
    if dim == "phase":
        return {"1ª morte do round": "como 1ª morte do round", "pré-plant": "antes do plant", "pós-plant": "depois do plant"}.get(v, v)
    if dim == "numbers":
        return {"em vantagem": "com o time em vantagem numérica", "em desvantagem": "com o time em desvantagem numérica",
                "igualdade": "em igualdade numérica"}.get(v, v)
    if dim == "ally_dist":
        return f"com o aliado mais próximo a {v}"
    if dim == "allies_near_b":
        return {"0": "sem aliado a até 15 m", "1": "com 1 aliado a até 15 m", "2+": "com 2 ou mais aliados a até 15 m"}.get(v, v)
    if dim == "economy":
        return {"pistol": "em pistol"}.get(v, f"com {v}")
    if dim == "fb_context":
        return {"é o first blood": "sendo o first blood do round", "time fez o FB": "depois de o time fazer o first blood",
                "time sofreu o FB": "depois de o time sofrer o first blood"}.get(v, v)
    if dim == "victim_name":
        return f"de {v}"
    if dim == "nearest_ally_name":
        return f"com {v} como aliado mais próximo"
    return f"{dim}={v}"


def label(ctx: dict) -> str:
    if not ctx:
        return "Todas as mortes com aliado vivo"
    order = ["victim_name", "nearest_ally_name", "side", "map_name", "phase", "numbers", "fb_context", "economy", "allies_near_b", "ally_dist"]
    return "Mortes " + " ".join(phrase(k, ctx[k]) for k in order if k in ctx)


def adv_phrase(dim: str, v: str) -> str:
    if dim == "state":
        return f"em {v}"
    if dim == "margin":
        return "de 1 jogador" if v == "1 jogador" else "de 2 ou mais jogadores"
    if dim in ("side", "map_name", "economy"):
        return phrase(dim, v)
    if dim == "spike":
        return "com a spike plantada" if v == "plantada" else "sem spike plantada"
    if dim == "when":
        return {"até 15 s": "conquistadas nos primeiros 15 s", "15–35 s": "conquistadas entre 15 e 35 s",
                "depois de 35 s": "conquistadas depois de 35 s"}.get(v, v)
    if dim == "origin":
        return "abertas pelo first blood do time" if v == "first blood do time" else "abertas depois da 1ª kill do round"
    return f"{dim}={v}"


def adv_label(ctx: dict) -> str:
    if not ctx:
        return "Todas as vantagens numéricas"
    order = ["state", "margin", "side", "map_name", "spike", "origin", "when", "economy"]
    return "Vantagens " + " ".join(adv_phrase(k, ctx[k]) for k in order if k in ctx)


def _specs(dims, pairs):
    return [["_all"]] + [[k] for k in dims] + [list(c) for c in combinations(pairs, 2)]


class Spec:
    """O que muda entre fundamentos: eventos, desfecho, esperado, dimensões testadas e como nomear o recorte."""

    def __init__(self, name, y, p, dims, pairs, label_fn, plant, eligible="eligible"):
        self.name, self.y, self.p, self.dims, self.label, self.eligible = name, y, p, dims, label_fn, eligible
        self.specs = _specs(dims, pairs)
        self.plant = plant  # (dimensão, valor) usado no teste de déficit plantado


def trade_spec(cfg) -> Spec:
    w = int(cfg["fundamentals"]["default_window_s"])
    return Spec("trade", f"traded_{w}s", f"exp_trade_{w}s", DIMS, PAIR_DIMS, label, ("ally_dist", "5–10 m"))


def adv_spec(cfg) -> Spec:
    return Spec("advantage", "won", "exp_adv_won", ADV_DIMS, ADV_PAIR_DIMS, adv_label, ("state", "5v4"))


# ---------------------------------------------------------------- first blood
# abertura: uma linha por time-round com FB (y = o time venceu o duelo de abertura)
FBO_DIMS = {"side": "lado", "map_name": "mapa", "economy": "economia", "when": "quando saiu o FB",
            "duel_name": "jogador no duelo", "duel_role": "função no duelo"}
FBO_PAIR_DIMS = ["side", "map_name", "when", "duel_role"]
# recuperação: time-rounds em que o time sofreu o FB (y = venceu o round)
FBR_DIMS = {"side": "lado", "map_name": "mapa", "economy": "economia", "when": "quando saiu o FB",
            "duel_name": "quem morreu primeiro", "duel_role": "função de quem morreu primeiro"}
FBR_PAIR_DIMS = ["side", "map_name", "when"]
ROLE_PL = {"Duelista": "duelistas", "Iniciador": "iniciadores", "Controlador": "controladores", "Sentinela": "sentinelas"}
ROLE_ART = {"Duelista": "um duelista", "Iniciador": "um iniciador", "Controlador": "um controlador", "Sentinela": "uma sentinela"}


FB_WHEN = {"até 15 s": "nos primeiros 15 s", "15–35 s": "entre 15 e 35 s", "depois de 35 s": "depois de 35 s"}


def _fb_rest(ctx: dict) -> list[str]:
    out = [phrase(k, ctx[k]) for k in ("side", "map_name") if k in ctx]
    if "when" in ctx:
        out.append(FB_WHEN.get(ctx["when"], ctx["when"]))
    if "economy" in ctx:
        out.append(phrase("economy", ctx["economy"]))
    return out


def fbo_label(ctx: dict) -> str:
    """Ex.: "Duelos de abertura de duelistas na defesa nos primeiros 15 s"."""
    if not ctx:
        return "Todos os duelos de abertura"
    head = "Duelos de abertura"
    if "duel_name" in ctx:
        head += f" de {ctx['duel_name']}"
    elif "duel_role" in ctx:
        head += f" de {ROLE_PL.get(ctx['duel_role'], ctx['duel_role'])}"
    return " ".join([head] + _fb_rest(ctx))


def fbr_label(ctx: dict) -> str:
    """Ex.: "Rounds depois de sofrer o first blood nos primeiros 15 s, em Ascent"."""
    if not ctx:
        return "Todos os rounds depois de sofrer o first blood"
    head = "Rounds depois de sofrer o first blood"
    if "when" in ctx:
        head += " " + FB_WHEN.get(ctx["when"], ctx["when"])
    rest = _fb_rest({k: v for k, v in ctx.items() if k != "when"})
    if "duel_name" in ctx:
        rest.append(f"com {ctx['duel_name']} como 1ª morte")
    elif "duel_role" in ctx:
        rest.append(f"com {ROLE_ART.get(ctx['duel_role'], ctx['duel_role'])} como 1ª morte")
    return head + (", " + " ".join(rest) if rest else "")


def fbo_spec(cfg) -> Spec:
    return Spec("fb_open", "got_fb", "exp_fb_open", FBO_DIMS, FBO_PAIR_DIMS, fbo_label, ("side", "def"))


def fbr_spec(cfg) -> Spec:
    return Spec("fb_rec", "won", "exp_fb_rec", FBR_DIMS, FBR_PAIR_DIMS, fbr_label, ("side", "atk"), eligible="eligible_rec")


def _prepare(deaths: pd.DataFrame, cfg, spec: Spec | None = None) -> pd.DataFrame:
    spec = spec or trade_spec(cfg)
    d = deaths[deaths[spec.eligible].astype(bool) & deaths[spec.p].notna()].copy()
    d["y"] = d[spec.y].astype(float)
    d["p"] = d[spec.p].astype(float)
    d["v"] = d["p"] * (1 - d["p"])
    d["_all"] = "todas"
    return d


def _scopes(d: pd.DataFrame, last_ns) -> list[tuple[str, pd.DataFrame]]:
    out = [("todas", d)]
    order = d[["team_name", "match_id", "game_start_ms"]].drop_duplicates().sort_values("game_start_ms")
    for n in last_ns:
        keep = order.groupby("team_name").tail(n)[["team_name", "match_id"]]
        out.append((f"ultimas_{n}", d.merge(keep, on=["team_name", "match_id"])))
    return out


def _dims_json(frame: pd.DataFrame, keys: list[str]) -> list[str]:
    real = [k for k in keys if k != "_all"]
    if not real:
        return ["{}"] * len(frame)
    return [json.dumps(dict(zip(real, map(str, vals))), ensure_ascii=False, sort_keys=True)
            for vals in frame[real].itertuples(index=False, name=None)]


def slice_table(d: pd.DataFrame, scope: str, keep_per_match: bool = True, specs=None):
    """Somas por time × recorte (e por partida, para bootstrap e recorrência)."""
    rows, per_match = [], {}
    for keys in specs or _specs(DIMS, PAIR_DIMS):
        pm = d.groupby(["team_name"] + keys + ["match_id"], observed=True).agg(
            y=("y", "sum"), p=("p", "sum"), v=("v", "sum"), n=("y", "size")).reset_index()
        g = pm.groupby(["team_name"] + keys, observed=True).agg(
            y=("y", "sum"), p=("p", "sum"), v=("v", "sum"), n=("n", "sum"), n_matches=("match_id", "nunique")).reset_index()
        rows.append(pd.DataFrame({"scope": scope, "team": g["team_name"].to_numpy(), "dims": _dims_json(g, keys),
                                  "level": len([k for k in keys if k != "_all"]), "y": g["y"].to_numpy(), "p": g["p"].to_numpy(),
                                  "v": g["v"].to_numpy(), "n_events": g["n"].to_numpy(), "n_matches": g["n_matches"].to_numpy()}))
        if keep_per_match:
            pm["_dims"] = _dims_json(pm, keys)
            for (team, dm), gg in pm.groupby(["team_name", "_dims"], sort=False):
                per_match[(scope, team, dm)] = gg[["y", "p", "n"]].to_numpy(dtype=float)
    s = pd.concat(rows, ignore_index=True)
    s["z"] = (s["y"] - s["p"]) / np.sqrt(s["v"].clip(lower=1e-9))
    return s, per_match


def calibrate_threshold(d: pd.DataFrame, cfg, spec: Spec | None = None) -> tuple[float, pd.DataFrame]:
    """z* tal que, em dados nulos (desfechos sorteados do esperado), no máximo `null_team_rate` dos times teria
    algum recorte com |z| ≥ z* (entre os recortes com amostra mínima)."""
    P = cfg["fundamentals"]["patterns"]
    rng = np.random.default_rng(P["seed"])
    maxz = []
    for k in range(P["null_sims"]):
        sim = d.copy()
        sim["y"] = (rng.random(len(sim)) < sim["p"].to_numpy()).astype(float)
        s, _ = slice_table(sim, "todas", keep_per_match=False, specs=(spec or trade_spec(cfg)).specs)
        s = s[(s["n_events"] >= P["min_events"]) & (s["n_matches"] >= P["min_matches"])]
        m = s.groupby("team")["z"].apply(lambda z: np.abs(z).max())
        maxz.append(pd.DataFrame({"sim": k, "team": m.index, "max_abs_z": m.to_numpy()}))
    null = pd.concat(maxz, ignore_index=True)
    z_star = float(np.quantile(null["max_abs_z"], 1 - P["null_team_rate"]))
    return z_star, null


def detect_patterns(deaths: pd.DataFrame, cfg, z_star: float | None = None, spec: Spec | None = None) -> pd.DataFrame:
    P = cfg["fundamentals"]["patterns"]
    spec = spec or trade_spec(cfg)
    d = _prepare(deaths, cfg, spec)
    if z_star is None:
        z_star, _ = calibrate_threshold(d, cfg, spec)
    mcol = spec.p.replace("exp_", "model_", 1)
    model = d[mcol].iloc[0] if len(d) and mcol in d else ""
    rng = np.random.default_rng(P["seed"] + 100)
    parts, per_match = [], {}
    for scope, e in _scopes(d, P["scopes_last_n"]):
        s, pm = slice_table(e, scope, specs=spec.specs)
        parts.append(s)
        per_match.update(pm)
    s = pd.concat(parts, ignore_index=True)
    s["observed"] = s["y"] / s["n_events"]
    s["expected"] = s["p"] / s["n_events"]
    s["gap_pp"] = 100 * (s["observed"] - s["expected"])
    s["events_vs_expected"] = s["y"] - s["p"]
    s["p_value"] = 2 * norm.sf(np.abs(s["z"]))
    s["direction"] = np.where(s["gap_pp"] < 0, "abaixo", "acima")
    s["testable"] = (s["n_events"] >= P["min_events"]) & (s["n_matches"] >= P["min_matches"])
    s["z_star"] = z_star

    # bootstrap de partidas + recorrência para candidatos e para os resumos gerais (nível 0)
    lo_q, hi_q = (1 - P["ci_level"]) / 2, 1 - (1 - P["ci_level"]) / 2
    cand = (s["testable"] & (s["z"].abs() >= min(z_star, P["watch_z"]))) | (s["level"] == 0)
    s["ci_lo_pp"], s["ci_hi_pp"], s["recurrence"], s["n_rec_matches"] = np.nan, np.nan, np.nan, 0
    for i in s.index[cand]:
        arr = per_match[(s.at[i, "scope"], s.at[i, "team"], s.at[i, "dims"])]
        y, p, n = arr[:, 0], arr[:, 1], arr[:, 2]
        idx = rng.integers(0, len(n), size=(P["bootstrap"], len(n)))
        gaps = 100 * (y[idx].sum(1) - p[idx].sum(1)) / n[idx].sum(1)
        s.at[i, "ci_lo_pp"], s.at[i, "ci_hi_pp"] = np.quantile(gaps, lo_q), np.quantile(gaps, hi_q)
        ok = n >= P["min_events_per_match"]
        if ok.any():
            same = (y[ok] < p[ok]) if s.at[i, "gap_pp"] < 0 else (y[ok] > p[ok])
            s.at[i, "recurrence"], s.at[i, "n_rec_matches"] = same.mean(), int(ok.sum())
    excl0 = np.where(s["gap_pp"] < 0, s["ci_hi_pp"] < 0, s["ci_lo_pp"] > 0)
    s["selected"] = (s["testable"] & (s["z"].abs() >= z_star) & excl0 & (s["recurrence"] >= P["min_recurrence"])
                     & (s["n_rec_matches"] >= P["min_matches"]))

    # hierarquia: geral -> recortes simples -> pares
    s["parent_dims"] = ""
    overall = s[s["level"] == 0].set_index(["scope", "team"])
    s["overall_gap_pp"] = [overall["gap_pp"].get((sc, t), np.nan) for sc, t in zip(s["scope"], s["team"])]
    s["excess_pp"] = s["gap_pp"] - s["overall_gap_pp"]
    ov = {k: (bool(r["selected"]), r["direction"]) for k, r in overall.iterrows()}
    for i in s.index[s["selected"] & (s["level"] > 0)]:
        sel0, dir0 = ov.get((s.at[i, "scope"], s.at[i, "team"]), (False, ""))
        if sel0 and dir0 == s.at[i, "direction"]:
            if abs(s.at[i, "gap_pp"]) < abs(s.at[i, "overall_gap_pp"]) + P["min_excess_pp"]:
                s.at[i, "selected"] = False
            else:
                s.at[i, "parent_dims"] = "{}"
    simple = s[s["selected"] & (s["level"] == 1)].set_index(["scope", "team", "dims"])["gap_pp"]
    for i in s.index[s["selected"] & (s["level"] == 2)]:
        ctx = json.loads(s.at[i, "dims"])
        parents = [json.dumps({k: v}, ensure_ascii=False, sort_keys=True) for k, v in ctx.items()]
        sel = [(pd_, simple.get((s.at[i, "scope"], s.at[i, "team"], pd_), np.nan)) for pd_ in parents]
        sel = [(pd_, g) for pd_, g in sel if np.isfinite(g)]
        if sel and abs(s.at[i, "gap_pp"]) < max(abs(g) for _, g in sel) + P["min_excess_pp"]:
            s.at[i, "selected"] = False
        elif sel:
            s.at[i, "parent_dims"] = max(sel, key=lambda t: abs(t[1]))[0]

    # sinais a observar: tudo menos o limiar z*; até 5 por time e conjunto, sem repetir o que já é padrão
    watch = (s["testable"] & ~s["selected"] & (s["z"].abs() >= P["watch_z"]) & excl0
             & (s["recurrence"] >= P["min_recurrence"]) & (s["n_rec_matches"] >= P["min_matches"]))
    sel_keys = set(zip(s.loc[s["selected"], "scope"], s.loc[s["selected"], "team"], s.loc[s["selected"], "dims"]))
    s["watch"] = False
    w_idx = s.index[watch]
    if len(w_idx):
        ww = s.loc[w_idx].assign(_m=s.loc[w_idx, "events_vs_expected"].abs()).sort_values("_m", ascending=False)
        ww = ww.groupby(["scope", "team"]).head(5)
        s.loc[ww.index, "watch"] = True
    s["tier"] = np.where(s["selected"], "padrão", np.where(s["watch"], "a observar", ""))

    s["fundamental"], s["model"] = spec.name, model
    s["window_s"] = int(cfg["fundamentals"]["default_window_s"]) if spec.name == "trade" else 0
    s["label"] = [spec.label(json.loads(x)) for x in s["dims"]]
    s["pattern_id"] = [spec.name + "|" + sc + "|" + t + "|" + dm for sc, t, dm in zip(s["scope"], s["team"], s["dims"])]
    cols = ["pattern_id", "fundamental", "scope", "team", "dims", "level", "label", "direction", "observed", "expected",
            "gap_pp", "ci_lo_pp", "ci_hi_pp", "events_vs_expected", "overall_gap_pp", "excess_pp", "n_events", "n_matches",
            "recurrence", "n_rec_matches", "z", "z_star", "p_value", "testable", "selected", "watch", "tier", "parent_dims", "window_s", "model"]
    s["_mag"] = s["events_vs_expected"].abs()
    return s.sort_values(["scope", "team", "selected", "_mag"], ascending=[True, True, False, False])[cols].reset_index(drop=True)


class _Override:
    """Config com alguns valores de `fundamentals.patterns` trocados (usado nas simulações)."""

    def __init__(self, cfg, **patterns):
        self.cfg, self.patterns = cfg, patterns

    def __getitem__(self, k):
        if k == "fundamentals":
            f = dict(self.cfg["fundamentals"])
            f["patterns"] = {**f["patterns"], **self.patterns}
            return f
        return self.cfg[k]


def validate_detector(deaths: pd.DataFrame, cfg, z_star: float, n_null: int = 5, effect_pp: float = 12.0,
                      spec: Spec | None = None) -> pd.DataFrame:
    """Validação com sorteios novos (independentes dos usados na calibração):
    - nulo: desfechos de todos os times sorteados do próprio esperado -> times que recebem algum padrão (falso);
    - déficit plantado: nos 3 times com mais partidas, retira ≈ effect_pp de trades das mortes com aliado a 5–10 m
      e verifica se o detector encontra um padrão que contenha esse recorte.
    O esperado (p) não depende dos desfechos, então o mesmo z* vale para os dados simulados."""
    spec = spec or trade_spec(cfg)
    col, pcol = spec.y, spec.p
    pdim, pval = spec.plant
    rng = np.random.default_rng(cfg["fundamentals"]["patterns"]["seed"] + 1)
    el = (deaths[spec.eligible].astype(bool) & deaths[pcol].notna()).to_numpy()
    c2 = _Override(cfg, scopes_last_n=[])
    rows = []
    for k in range(n_null):
        sim = deaths.copy()
        sim.loc[el, col] = rng.random(int(el.sum())) < sim.loc[el, pcol].to_numpy()
        pt = detect_patterns(sim, c2, z_star, spec)
        sel = pt[pt["selected"]]
        rows.append({"fundamental": spec.name, "teste": "nulo (nenhum padrão real)", "rodada": k, "times": pt["team"].nunique(),
                     "times_com_padrao": sel["team"].nunique(), "padroes": len(sel),
                     "times_com_sinal_a_observar": pt.loc[pt["watch"], "team"].nunique(), "detectado": np.nan})
    tm = deaths[el].groupby("team_name")["match_id"].nunique().sort_values(ascending=False)
    for team in tm.index[:3]:
        sim = deaths.copy()
        sim.loc[el, col] = rng.random(int(el.sum())) < sim.loc[el, pcol].to_numpy()
        tgt = el & (sim["team_name"] == team).to_numpy() & (sim[pdim].astype(str) == pval).to_numpy()
        frac = (effect_pp / 100 / sim[pcol].clip(lower=0.05)).to_numpy()
        drop = tgt & sim[col].astype(bool).to_numpy() & (rng.random(len(sim)) < frac)
        sim.loc[drop, col] = False
        pt = detect_patterns(sim, c2, z_star, spec)
        hit = pt[(pt["team"] == team) & pt["selected"] & ((pt["level"] == 0) | pt["dims"].str.contains(pval, regex=False))]
        rows.append({"fundamental": spec.name, "teste": f"déficit plantado: {team}, {pdim} = {pval}, −{effect_pp:.0f} pp", "rodada": 0, "times": 1,
                     "times_com_padrao": np.nan, "padroes": np.nan, "detectado": bool(len(hit))})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- fundamentos de round
PLANT_DIMS = {"numbers": "saldo de vivos no plant", "pstate": "vivos no plant", "site": "site", "pwhen": "momento do plant",
              "map_name": "mapa", "economy": "economia"}
PLANT_PAIR_DIMS = ["numbers", "site", "pwhen", "map_name"]
PWHEN = {"até 30 s": "plantados nos primeiros 30 s", "30–60 s": "plantados entre 30 e 60 s", "depois de 60 s": "plantados depois de 60 s"}


def _plant_rest(ctx: dict, retake: bool) -> list[str]:
    out = []
    if "pstate" in ctx:
        out.append(f"em {ctx['pstate']} no plant")
    elif "numbers" in ctx:
        out.append({"em vantagem": "com vantagem numérica no plant", "em desvantagem": "com desvantagem numérica no plant",
                    "igualdade": "em igualdade numérica no plant"}[ctx["numbers"]])
    if "site" in ctx:
        out.append(f"no {ctx['site']}")
    if "map_name" in ctx:
        out.append(f"em {ctx['map_name']}")
    if "pwhen" in ctx:
        out.append(PWHEN.get(ctx["pwhen"], ctx["pwhen"]))
    if "economy" in ctx:
        out.append(phrase("economy", ctx["economy"]))
    return out


def post_label(ctx: dict) -> str:
    return "Todos os rounds em que o time plantou" if not ctx else " ".join(["Pós-plant"] + _plant_rest(ctx, False))


def ret_label(ctx: dict) -> str:
    return "Todos os rounds com a spike adversária plantada" if not ctx else " ".join(["Retakes"] + _plant_rest(ctx, True))


KEYR_DIMS = {"round_type": "tipo de round", "side": "lado", "map_name": "mapa", "half": "half"}
KEYR_PAIR_DIMS = ["round_type", "side", "map_name"]
RTYPE = {"pistol": "Pistols", "eco": "Rounds em eco", "anti-eco": "Anti-ecos", "force buy": "Rounds de force buy", "armado": "Rounds armados (full × full)"}


def key_label(ctx: dict) -> str:
    if not ctx:
        return "Todos os rounds-chave"
    head = RTYPE.get(ctx.get("round_type"), "Rounds-chave")
    rest = [phrase(k, ctx[k]) for k in ("side", "map_name") if k in ctx]
    if "half" in ctx:
        rest.append(f"no {ctx['half']}")
    return " ".join([head] + rest)


HALF_DIMS = {"moment": "momento", "side": "lado", "map_name": "mapa", "half": "half"}
HALF_PAIR_DIMS = ["moment", "side", "map_name"]


def half_label(ctx: dict) -> str:
    if not ctx:
        return "Todos os rounds 2 e 3 de cada half"
    head = ctx["moment"][0].upper() + ctx["moment"][1:] if "moment" in ctx else "Rounds 2 e 3 do half"
    rest = [phrase(k, ctx[k]) for k in ("side", "map_name") if k in ctx]
    if "half" in ctx:
        rest.append(f"no {ctx['half']}")
    return " ".join([head] + rest)


def post_spec(cfg) -> Spec:
    return Spec("post", "won", "exp_post", PLANT_DIMS, PLANT_PAIR_DIMS, post_label, ("site", "A"), eligible="eligible_post")


def ret_spec(cfg) -> Spec:
    return Spec("retake", "won", "exp_ret", PLANT_DIMS, PLANT_PAIR_DIMS, ret_label, ("site", "A"), eligible="eligible_ret")


def key_spec(cfg) -> Spec:
    return Spec("keyrounds", "won", "exp_key", KEYR_DIMS, KEYR_PAIR_DIMS, key_label, ("round_type", "eco"))


def half_spec(cfg) -> Spec:
    return Spec("halfopen", "won", "exp_half", HALF_DIMS, HALF_PAIR_DIMS, half_label, ("side", "atk"))


PRESS_DIMS = {"lead": "placar", "phase": "fase do half", "side": "lado", "map_name": "mapa", "economy": "economia"}
PRESS_PAIR_DIMS = ["lead", "phase", "side", "map_name"]


def press_label(ctx: dict) -> str:
    if not ctx:
        return "Todos os rounds decisivos"
    head = "Rounds decisivos" + ({"na frente": " com o time na frente", "atrás": " com o time atrás", "empatado": " com o placar empatado"}.get(ctx.get("lead"), ""))
    rest = []
    if "phase" in ctx:
        rest.append({"abertura do half": "na abertura do half", "meio do half": "no meio do half", "fim do half": "no fim do half",
                     "prorrogação": "na prorrogação"}.get(ctx["phase"], ctx["phase"]))
    rest += [phrase(k, ctx[k]) for k in ("side", "map_name", "economy") if k in ctx]
    return " ".join([head] + rest)


def press_spec(cfg) -> Spec:
    return Spec("pressure", "won", "exp_press", PRESS_DIMS, PRESS_PAIR_DIMS, press_label, ("side", "atk"))
