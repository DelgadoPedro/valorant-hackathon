"""Lentes: Rounds-chave e ciclos econômicos (KEY) e Dinâmica coletiva e vantagens (DYN)."""
import numpy as np
import pandas as pd

from .base import KEY, emit, metric


# ============================================================ KEY
@metric("KEY-01", "ratio", "taxa de vitória", "Pistols = rounds 1 e 13 (roundNum 0 e 12). Vitórias / pistols jogados.")
def key01(ctx):
    d = ctx.tr[ctx.tr["is_pistol"]]
    return emit(d, "KEY-01", d["won"].astype(float))


def _after_pistol(ctx):
    tr = ctx.tr
    pist = tr[tr["is_pistol"]][KEY + ["won"]].rename(columns={"won": "won_pistol"})
    pist["round_num"] = pist["round_num"] + 1
    return tr.merge(pist, on=KEY, how="inner")


@metric("KEY-02", "ratio", "taxa de vitória", "Elegível: round 2/14 após VENCER o pistol. Num: venceu.")
def key02(ctx):
    d = _after_pistol(ctx)
    d = d[d["won_pistol"]]
    return emit(d, "KEY-02", d["won"].astype(float))


@metric("KEY-03", "ratio", "taxa de vitória", "Elegível: round 2/14 após PERDER o pistol. Num: venceu.")
def key03(ctx):
    d = _after_pistol(ctx)
    d = d[~d["won_pistol"]]
    return emit(d, "KEY-03", d["won"].astype(float))


@metric("KEY-04", "mean", "créditos", "Σ economy.spent do time nos pistols.")
def key04(ctx):
    d = ctx.tr[ctx.tr["is_pistol"]]
    return emit(d, "KEY-04", d["team_spent"])


@metric("KEY-05", "mean", "coef. de variação", "Dispersão entre os 5 jogadores no pistol: CV do gasto (estrato 'gasto') "
        "e do loadout (estrato 'loadout').")
def key05(ctx):
    d = ctx.tr[ctx.tr["is_pistol"]]
    return pd.concat([emit(d, "KEY-05", d["spent_cv"], stratum="gasto"),
                      emit(d, "KEY-05", d["loadout_cv"], stratum="loadout")], ignore_index=True)


def _anti_eco(ctx):
    tr = ctx.tr
    return tr[(tr["opp_buy_type"] == "eco") & (tr["buy_type"].isin(["half", "full"]))]


@metric("KEY-06", "ratio", "taxa de vitória", "Elegível: adversário em eco (Σloadout < team_eco_max) e time não-eco, fora dos pistols. Num: venceu.",
        params=("economy.team_eco_max", "economy.team_full_min"))
def key06(ctx):
    d = _anti_eco(ctx)
    return emit(d, "KEY-06", d["won"].astype(float))


@metric("KEY-15", "ratio", "taxa de vitória", "Elegível: o time está em eco (Σloadout < team_eco_max), fora dos pistols; qualquer compra do adversário. "
        "Num: venceu.", params=("economy.team_eco_max",))
def key15(ctx):
    d = ctx.tr[ctx.tr["buy_type"] == "eco"]
    return emit(d, "KEY-15", d["won"].astype(float))


@metric("KEY-16", "ratio", "taxa de vitória", "Elegível: os dois times armados (full buy: Σloadout ≥ team_full_min), fora dos pistols. Num: venceu.",
        params=("economy.team_full_min",))
def key16(ctx):
    d = ctx.tr[(ctx.tr["buy_type"] == "full") & (ctx.tr["opp_buy_type"] == "full")]
    return emit(d, "KEY-16", d["won"].astype(float))


@metric("KEY-07", "ratio", "taxa", "Vitórias marcadas pela Riot como 'Thrifty' (roundCeremony = CeremonyThrifty) / rounds jogados. "
        "Versão por regra própria: ECO-09.", crosscheck="ECO-09 (regra por diferença de loadout)")
def key07(ctx):
    d = ctx.tr
    return emit(d, "KEY-07", (d["won"] & (d["ceremony"] == "CeremonyThrifty")).astype(float))


@metric("KEY-08", "ratio", "taxa de derrota", "Elegível: mesma situação de KEY-06 (anti-eco). Num: perdeu. (Σnum = contagem.)",
        params=("economy.team_eco_max", "economy.team_full_min"))
def key08(ctx):
    d = _anti_eco(ctx)
    return emit(d, "KEY-08", (~d["won"]).astype(float))


@metric("KEY-09", "ratio", "taxa de vitória", "Elegível: force buy (após derrota, compra não-eco com ≥ force_min_players sem créditos "
        "para kit completo). Estrato 'round_atual' = venceu o force; 'round_seguinte' = venceu o round seguinte.",
        params=("economy.force_player_available_max", "economy.force_min_players", "economy.team_eco_max"))
def key09(ctx):
    d = ctx.tr[ctx.tr["is_force"]]
    nxt = d[d["next_won"].notna()]
    return pd.concat([emit(d, "KEY-09", d["won"].astype(float), stratum="round_atual"),
                      emit(nxt, "KEY-09", nxt["next_won"].astype(float), stratum="round_seguinte")], ignore_index=True)


@metric("KEY-10", "ratio", "taxa de vitória", "Elegível: provável bonus (após vitória, compra 'half' com Σgasto ≤ bonus_spent_max). "
        "Num: venceu. Estrato: '3o_round_apos_pistol' (bonus clássico) ou 'outros'.",
        params=("economy.bonus_spent_max", "economy.team_eco_max", "economy.team_full_min"))
def key10(ctx):
    tr = ctx.tr
    prev2 = tr.groupby(["match_id", "team_id"])["won"].shift(2)
    classic = tr["round_num"].isin([2, 14]) & (tr["prev_won"] == True) & (prev2 == True)  # noqa: E712
    d = tr[tr["is_bonus"]]
    strat = np.where(classic[tr["is_bonus"]], "3o_round_apos_pistol", "outros")
    return emit(d, "KEY-10", d["won"].astype(float), stratum=strat)


@metric("KEY-11", "ratio", "taxa de vitória", "Elegível: o time ficou com 1 vivo contra ≥2 adversários em algum momento. "
        "Num: venceu. Estrato = situação no momento (1v2, 1v3…).", crosscheck="roundCeremony = CeremonyClutch")
def key11(ctx):
    d = ctx.diff_timeline
    c = d[(d["alive"] == 1) & (d["opp_alive"] >= 2)].groupby(KEY).first().reset_index()
    c = c.merge(ctx.tr[KEY + ["won"]], on=KEY)
    return emit(c, "KEY-11", c["won"].astype(float), stratum="1v" + c["opp_alive"].astype(int).astype(str))


@metric("KEY-12", "ratio", "taxa", "Elegível: rounds vencidos. Num: o time não sofreu nenhuma morte.",
        crosscheck="roundCeremony = CeremonyFlawless")
def key12(ctx):
    d = ctx.tr[ctx.tr["won"]]
    deaths = ctx.deaths.groupby(["match_id", "round_num", "victim_team"]).size().rename("n").reset_index()
    deaths = deaths.rename(columns={"victim_team": "team_id"})
    d = d.merge(deaths, on=KEY, how="left")
    return emit(d, "KEY-12", d["n"].isna().astype(float))


@metric("KEY-13", "ratio", "taxa de vitória", "Elegível: rounds logo após ≥N derrotas seguidas (N em loss_streaks), "
        "sem contar pistols. Num: venceu. Estrato = N.", params=("rounds.loss_streaks",))
def key13(ctx):
    out = []
    for n in ctx.cfg["rounds"]["loss_streaks"]:
        d = ctx.tr[(ctx.tr["loss_streak_before"] >= n) & (~ctx.tr["is_pistol"])]
        out.append(emit(d, "KEY-13", d["won"].astype(float), stratum=f"apos_{n}_derrotas"))
    return pd.concat(out, ignore_index=True)


@metric("KEY-14", "ratio", "taxa de vitória", "Rounds de prorrogação (roundNum ≥ 24): vitórias / rounds.")
def key14(ctx):
    d = ctx.tr[ctx.tr["is_overtime"]]
    return emit(d, "KEY-14", d["won"].astype(float))


# ============================================================ DYN
def _reached(ctx):
    d = ctx.diff_timeline
    g = d.groupby(KEY)["diff"].agg(["max", "min"]).reset_index()
    return g.merge(ctx.tr[KEY + ["won"]], on=KEY)


@metric("DYN-01", "ratio", "taxa de vitória", "Para cada vantagem k=+1,+2… alcançada em algum momento do round: venceu? Estrato = +k.")
def dyn01(ctx):
    g = _reached(ctx)
    out = []
    for k in range(1, 6):
        x = g[g["max"] >= k]
        out.append(emit(x, "DYN-01", x["won"].astype(float), stratum=f"+{k}"))
    return pd.concat(out, ignore_index=True)


@metric("DYN-02", "ratio", "taxa de vitória", "Para cada desvantagem k=−1,−2… sofrida em algum momento do round: venceu? Estrato = −k.")
def dyn02(ctx):
    g = _reached(ctx)
    out = []
    for k in range(1, 6):
        x = g[g["min"] <= -k]
        out.append(emit(x, "DYN-02", x["won"].astype(float), stratum=f"-{k}"))
    return pd.concat(out, ignore_index=True)


@metric("DYN-03", "mean", "segundos", "Duração de cada vantagem numérica (diff passa de ≤0 para >0) até ser anulada. "
        "Estrato 'anulada' = duração observada; 'mantida' = vantagem durou até o último evento (limite inferior).")
def dyn03(ctx):
    rows = []
    for key, g in ctx.diff_timeline.groupby(KEY, sort=False):
        diffs, times = g["diff"].to_numpy(), g["t_ms"].to_numpy()
        start, prev = None, 0
        for dval, tt in zip(diffs, times):
            if prev <= 0 < dval:
                start = tt
            elif prev > 0 >= dval and start is not None:
                rows.append((*key, (tt - start) / 1000, "anulada"))
                start = None
            prev = dval
        if start is not None:
            rows.append((*key, (times[-1] - start) / 1000, "mantida"))
    x = pd.DataFrame(rows, columns=KEY + ["dur", "kind"])
    return emit(x, "DYN-03", x["dur"], stratum=x["kind"])


def _episodes(ctx) -> pd.DataFrame:
    """Episódios de vantagem (saldo passa de ≤0 para >0) e de desvantagem (de ≥0 para <0), com duração até o saldo
    voltar (vantagem anulada / desvantagem revertida = empatou ou virou) ou até o último evento do round."""
    rows = []
    for key, g in ctx.diff_timeline.groupby(KEY, sort=False):
        diffs, times = g["diff"].to_numpy(), g["t_ms"].to_numpy()
        own, opp = g["alive"].to_numpy(), g["opp_alive"].to_numpy()
        adv = dis = None
        prev = 0
        for i, dv in enumerate(diffs):
            if prev <= 0 < dv:
                adv = (times[i], own[i], opp[i])
            elif prev > 0 >= dv and adv is not None:
                rows.append((*key, "adv", (times[i] - adv[0]) / 1000, True, adv[1], adv[2]))
                adv = None
            if prev >= 0 > dv:
                dis = (times[i], own[i], opp[i])
            elif prev < 0 <= dv and dis is not None:
                rows.append((*key, "dis", (times[i] - dis[0]) / 1000, True, dis[1], dis[2]))
                dis = None
            prev = dv
        for kind, st in (("adv", adv), ("dis", dis)):
            if st is not None:
                rows.append((*key, kind, (times[-1] - st[0]) / 1000, False, st[1], st[2]))
    x = pd.DataFrame(rows, columns=KEY + ["kind", "dur", "ended", "own0", "opp0"])
    return x.merge(ctx.tr[KEY + ["won"]], on=KEY, how="left")


def _dur_bucket(d: pd.Series, ended: pd.Series, open_label: str, edges) -> np.ndarray:
    a, b = edges
    lab = np.where(d <= a, f"até {a:g} s", np.where(d <= b, f"{a:g}–{b:g} s", f"mais de {b:g} s"))
    return np.where(ended, lab, open_label)


def _states(ctx, advantage: bool) -> pd.DataFrame:
    """Situação em que a 1ª vantagem (ou desvantagem) do round começa: uma linha por time-round.
    Contar cada round uma vez evita que o mesmo round apareça em 5v4, 4v3, 3v2… e torna a distribuição somável (100%)."""
    d = ctx.diff_timeline
    if advantage:
        d = d[(d["alive"] > d["opp_alive"]) & (d["opp_alive"] >= 1)]
    else:
        d = d[(d["alive"] < d["opp_alive"]) & (d["alive"] >= 1)]
    d = d.sort_values(KEY + ["seq"]).drop_duplicates(KEY)
    d = d.assign(state=d["alive"].astype(int).astype(str) + "v" + d["opp_alive"].astype(int).astype(str))
    return d[KEY + ["state"]].merge(ctx.tr[KEY + ["won"]], on=KEY, how="left")


@metric("DYN-09", "ratio", "taxa de vitória", "Rounds em que o time fica com mais jogadores vivos (adversário ainda vivo): venceu? Cada round "
        "conta uma vez, na situação em que a 1ª vantagem começa (5v4, 4v3, 3v2…). Estrato = essa situação; 'geral' = qualquer "
        "vantagem (soma dos estratos).")
def dyn09(ctx):
    x = _states(ctx, True)
    return pd.concat([emit(x, "DYN-09", x["won"].astype(float), stratum="geral"),
                      emit(x, "DYN-09", x["won"].astype(float), stratum=x["state"])], ignore_index=True)


@metric("DYN-10", "ratio", "taxa de vitória", "Rounds em que o time fica com menos jogadores vivos (time ainda vivo): venceu? Cada round "
        "conta uma vez, na situação em que a 1ª desvantagem começa (4v5, 3v4, 2v3…). Estrato = essa situação; 'geral' = qualquer "
        "desvantagem (soma dos estratos).")
def dyn10(ctx):
    x = _states(ctx, False)
    return pd.concat([emit(x, "DYN-10", x["won"].astype(float), stratum="geral"),
                      emit(x, "DYN-10", x["won"].astype(float), stratum=x["state"])], ignore_index=True)


@metric("DYN-11", "mean", "segundos", "Duração de cada desvantagem numérica (saldo passa de ≥0 para <0, com o time ainda vivo) até o "
        "saldo voltar a ≥0 (empatou ou virou). Estrato 'revertida' = duração observada; 'não revertida' = até o último evento "
        "do round (limite inferior).")
def dyn11(ctx):
    x = _episodes(ctx)
    x = x[(x["kind"] == "dis") & (x["own0"] >= 1)]
    return emit(x, "DYN-11", x["dur"], stratum=np.where(x["ended"], "revertida", "não revertida"))


@metric("DYN-12", "ratio", "taxa de vitória", "Para cada vantagem numérica (como DYN-03, com o adversário ainda vivo no início): venceu o "
        "round? Estrato = quanto a vantagem durou antes de ser anulada (faixas de episode_buckets_s) ou 'mantida até o fim'. "
        "'Mantida até o fim' é quase sempre vitória por construção.", params=("timing.episode_buckets_s",))
def dyn12(ctx):
    x = _episodes(ctx)
    x = x[(x["kind"] == "adv") & (x["opp0"] >= 1)]
    st = _dur_bucket(x["dur"], x["ended"], "mantida até o fim", ctx.cfg["timing"]["episode_buckets_s"])
    return emit(x, "DYN-12", x["won"].astype(float), stratum=st)


@metric("DYN-13", "ratio", "taxa de vitória", "Para cada desvantagem numérica (como DYN-11): venceu o round? Estrato = quanto o time levou "
        "para sair da desvantagem (faixas de episode_buckets_s) ou 'não revertida'.", params=("timing.episode_buckets_s",))
def dyn13(ctx):
    x = _episodes(ctx)
    x = x[(x["kind"] == "dis") & (x["own0"] >= 1)]
    st = _dur_bucket(x["dur"], x["ended"], "não revertida", ctx.cfg["timing"]["episode_buckets_s"])
    return emit(x, "DYN-13", x["won"].astype(float), stratum=st)


@metric("DYN-04", "ratio", "proporção", "Rounds em que o time perdeu ≥2 jogadores (qualquer causa) com intervalo ≤ collapse_window.",
        params=("timing.collapse_window_s",))
def dyn04(ctx):
    k = ctx.deaths.sort_values(["match_id", "round_num", "victim_team", "t_ms"])
    k = k.assign(gap=k.groupby(["match_id", "round_num", "victim_team"])["t_ms"].diff())
    hit = k[k["gap"] <= ctx.cfg["timing"]["collapse_window_s"] * 1000][["match_id", "round_num", "victim_team"]]
    hit = hit.drop_duplicates().rename(columns={"victim_team": "team_id"}).assign(c=1.0)
    d = ctx.tr[KEY].merge(hit, on=KEY, how="left")
    return emit(d, "DYN-04", d["c"].fillna(0))


@metric("DYN-05", "mean", "mortes", "Maior sequência de mortes do time sem nenhuma morte adversária entre elas (por round).")
def dyn05(ctx):
    rows = []
    for (mid, rn), g in ctx.deaths.sort_values(["match_id", "round_num", "kill_idx"]).groupby(["match_id", "round_num"], sort=False):
        best = {"Red": 0, "Blue": 0}
        run_team, run = None, 0
        for vt in g["victim_team"]:
            if vt == run_team:
                run += 1
            else:
                run_team, run = vt, 1
            if vt in best:
                best[vt] = max(best[vt], run)
        rows += [(mid, rn, "Red", best["Red"]), (mid, rn, "Blue", best["Blue"])]
    x = pd.DataFrame(rows, columns=KEY + ["run"])
    d = ctx.tr[KEY].merge(x, on=KEY, how="left")
    return emit(d, "DYN-05", d["run"].fillna(0))


@metric("DYN-06", "mean", "dano", "Σ damage[].damage causado a adversários pelos 5 jogadores no round (dano em aliados excluído).")
def dyn06(ctx):
    return emit(ctx.tr, "DYN-06", ctx.tr["team_damage"])


@metric("DYN-07", "mean", "índice", "Concentração do dano no time: HHI das participações (estrato 'hhi'; 0,2 = igual, 1 = um só) "
        "e participação dos 2 maiores (estrato 'top2').")
def dyn07(ctx):
    tr = ctx.tr
    return pd.concat([emit(tr, "DYN-07", tr["dmg_hhi"], stratum="hhi"),
                      emit(tr, "DYN-07", tr["dmg_top2_share"], stratum="top2")], ignore_index=True)


@metric("DYN-08", "mean", "desvio-padrão entre partidas", "Para cada métrica em consistency_metrics: desvio-padrão do valor por partida "
        "do time (só times com ≥ min_matches_consistency partidas). Estrato = métrica.",
        params=("aggregation.consistency_metrics", "aggregation.min_matches_consistency"), level="aggregate")
def dyn08(ctx):  # calculado em aggregate.py
    return None
