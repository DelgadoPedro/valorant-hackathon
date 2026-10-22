"""Validação das métricas, em três camadas:

1. sanity      — checagens automáticas sobre a base real (linhas > 0, taxas em [0,1], valores finitos)
2. crosscheck  — comparação com um campo oficial independente do JSON (ex.: roundCeremony)
3. cenário     — partida sintética com resultado conhecido à mão; o pipeline inteiro roda nela e
                 cada métrica listada em EXPECTED precisa bater exatamente.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from .metrics.base import KEY, REGISTRY

RATE_UNITS = ("taxa", "proporção")


# ============================================================ 1. sanity
def sanity(enriched: pd.DataFrame, team_level: pd.DataFrame) -> pd.DataFrame:
    rows = []
    n_teams = team_level["team_name"].nunique()
    by_metric = dict(tuple(enriched.groupby("metric_id")))
    for mid, spec in REGISTRY.items():
        problems = []
        if spec.level == "aggregate":
            g = team_level[team_level["metric_id"] == mid]
            n = len(g)
            if n == 0:
                problems.append("sem linhas")
            teams = g["team_name"].nunique()
        else:
            g = by_metric.get(mid, pd.DataFrame(columns=enriched.columns))
            n = len(g)
            if n == 0:
                problems.append("sem linhas")
            if n and not np.isfinite(g["num"]).all():
                problems.append("num não finito")
            if n and spec.agg == "ratio" and any(u in spec.unit for u in RATE_UNITS):
                if ((g["num"] < 0) | (g["num"] > g["den"] + 1e-9)).any():
                    problems.append("taxa fora de [0,1]")
            if n and spec.unit == "cm" and (g["value"] < 0).any():
                problems.append("distância negativa")
            teams = team_level.loc[team_level["metric_id"] == mid, "team_name"].nunique()
        rows.append({"metric_id": mid, "linhas": n, "times_com_dado": teams, "times_total": n_teams,
                     "sanity_ok": not problems, "sanity_msg": "; ".join(problems)})
    return pd.DataFrame(rows)


# ============================================================ 2. crosscheck
def crosschecks(t: dict, enriched: pd.DataFrame, team_rounds: pd.DataFrame) -> pd.DataFrame:
    out = []
    tr = team_rounds
    r = t["rounds"]

    # KEY-12 x CeremonyFlawless: todo round "Flawless" da Riot deve ser flawless pela nossa regra
    k12 = enriched[enriched["metric_id"] == "KEY-12"][KEY + ["num"]]
    w = tr[tr["won"]][KEY + ["ceremony"]].merge(k12, on=KEY, how="left")
    cer = w[w["ceremony"] == "CeremonyFlawless"]
    agree = float((cer["num"] == 1).mean()) if len(cer) else np.nan
    out.append({"metric_id": "KEY-12", "check": "rounds com CeremonyFlawless que nossa regra marca como flawless",
                "valor": agree, "n": len(cer), "passou": bool(agree >= 0.98)})

    # KEY-11 x CeremonyClutch: vitórias de clutch da Riot em que o vencedor ficou com 1 vivo em algum momento
    d = enriched[enriched["metric_id"] == "KEY-11"][KEY + ["num"]]
    rc = r[r["ceremony"] == "CeremonyClutch"][["match_id", "round_num", "winning_team"]].rename(columns={"winning_team": "team_id"})
    j = rc.merge(d, on=KEY, how="left")
    share = float(j["num"].eq(1).mean()) if len(j) else np.nan
    out.append({"metric_id": "KEY-11", "check": "rounds CeremonyClutch cobertos por 1v≥2 vencido (Riot também conta 1v1)",
                "valor": share, "n": len(j), "passou": bool(share >= 0.5)})

    # ECO-09 / KEY-07: vitórias Thrifty da Riot devem ter loadout menor que o do adversário
    th = tr[tr["won"] & (tr["ceremony"] == "CeremonyThrifty")]
    share = float((th["loadout_diff"] < 0).mean()) if len(th) else np.nan
    out.append({"metric_id": "ECO-09", "check": "vitórias CeremonyThrifty com Σloadout próprio < adversário",
                "valor": share, "n": len(th), "passou": bool(share >= 0.95)})
    out.append({"metric_id": "KEY-07", "check": "idem ECO-09 (mesmo campo oficial)", "valor": share, "n": len(th),
                "passou": bool(share >= 0.95)})

    # OPN-01: exatamente um time faz o first blood em cada round com kill
    o = enriched[enriched["metric_id"] == "OPN-01"].groupby(["match_id", "round_num"])["num"].sum()
    ok = float((o == 1).mean()) if len(o) else np.nan
    out.append({"metric_id": "OPN-01", "check": "um único first blood por round", "valor": ok, "n": len(o),
                "passou": bool(ok == 1.0)})

    # ECO-07: diferença de loadout é antissimétrica (soma 0 por round)
    e = enriched[enriched["metric_id"] == "ECO-07"].groupby(["match_id", "round_num"])["num"].sum()
    ok = float((e.abs() < 1e-6).mean()) if len(e) else np.nan
    out.append({"metric_id": "ECO-07", "check": "Σ(diferença) = 0 nos dois times do round", "valor": ok, "n": len(e),
                "passou": bool(ok == 1.0)})

    # RET-01 x roundResult: defuses contados = rounds 'Bomb defused'
    rr = enriched[enriched["metric_id"] == "RET-01"]["num"].sum()
    n_def = int((r["result"] == "Bomb defused").sum())
    out.append({"metric_id": "RET-01", "check": "Σ defuses = rounds com roundResult 'Bomb defused'",
                "valor": float(rr), "n": n_def, "passou": bool(rr == n_def)})

    # POS-01 x resultado: vitórias pós-plant = rounds plantados vencidos pelo atacante
    pp = enriched[enriched["metric_id"] == "POS-01"]["num"].sum()
    n_pp = int((r["has_plant"] & (r["winning_role"] == "Attacker")).sum())
    out.append({"metric_id": "POS-01", "check": "Σ conversões = rounds com plant vencidos pelo ataque",
                "valor": float(pp), "n": n_pp, "passou": bool(pp == n_pp)})

    # DYN-06: Σ dano por round = Σ da tabela damage (só inimigos)
    dmg = t["damage"]
    tot = dmg[dmg["attacker_team"] != dmg["receiver_team"]]["damage"].sum()
    calc = enriched[enriched["metric_id"] == "DYN-06"]["num"].sum()
    out.append({"metric_id": "DYN-06", "check": "Σ dano agregado = Σ damage[] (inimigos)", "valor": float(calc),
                "n": int(tot), "passou": bool(abs(calc - tot) < 1)})

    # ---------------- espelhos: o que um time sofre é o que o adversário faz (por partida)
    def by_team_match(mid):
        x = enriched[enriched["metric_id"] == mid]
        return x.groupby(["match_id", "team_id"])[["num", "den"]].sum()
    for child, parent, what in (("TRD-13", "TRD-01", "kills do time trocadas = mortes do adversário trocadas"),
                                ("OPN-13", "OPN-07", "FB feito trocado = FB sofrido trocado pelo adversário"),
                                ("POS-13", "RET-06", "1º contato pós-plant visto pelos dois times")):
        a = by_team_match(child)
        b = by_team_match(parent).reset_index()
        b["team_id"] = b["team_id"].map({"Red": "Blue", "Blue": "Red"})
        j = a.join(b.set_index(["match_id", "team_id"]), how="outer", lsuffix="_c", rsuffix="_p").fillna(0)
        ok = float(((j["num_c"] - j["num_p"]).abs() < 1e-9).mean() * ((j["den_c"] - j["den_p"]).abs() < 1e-9).mean()) if len(j) else np.nan
        out.append({"metric_id": child, "check": f"{child} = {parent} do adversário ({what})", "valor": ok, "n": len(j), "passou": bool(ok == 1.0)})

    # DYN-09/10 'geral' ⊆ DYN-01 +1 / DYN-02 −1 (toda vantagem passa por +1); OPN-15 'sofreu' = OPN-12
    for child, st, parent, pst in (("DYN-09", "geral", "DYN-01", "+1"), ("DYN-10", "geral", "DYN-02", "-1")):
        c = enriched[(enriched["metric_id"] == child) & (enriched["stratum"] == st)].set_index(KEY)["num"]
        p_ = enriched[(enriched["metric_id"] == parent) & (enriched["stratum"] == pst)].set_index(KEY)["num"]
        inside = c.index.isin(p_.index)
        same = (c[inside] == p_.reindex(c.index[inside])).mean() if inside.any() else np.nan
        ok = float(inside.mean() * same) if len(c) else np.nan
        out.append({"metric_id": child, "check": f"rounds de '{st}' estão em {parent} {pst}, com o mesmo resultado", "valor": ok,
                    "n": len(c), "passou": bool(ok == 1.0)})
    # DYN-09/10: cada round conta uma vez -> Σ estratos de situação = 'geral' em cada time-round
    for mid in ("DYN-09", "DYN-10"):
        x = enriched[enriched["metric_id"] == mid]
        g = x[x["stratum"] == "geral"].groupby(KEY)["den"].sum()
        st = x[x["stratum"] != "geral"].groupby(KEY)["den"].sum()
        j = pd.concat([g.rename("g"), st.rename("s")], axis=1).fillna(0)
        ok = float(((j["g"] == 1) & (j["s"] == 1)).mean()) if len(j) else np.nan
        out.append({"metric_id": mid, "check": "uma situação por round (Σ estratos = 'geral' = 1)", "valor": ok, "n": len(j), "passou": bool(ok == 1.0)})
    # RET-12: retake não tentado só em rounds com explosão; os dois tipos somam o total
    x = enriched[enriched["metric_id"] == "RET-12"]
    tot = x[x["stratum"] == ""].set_index(KEY)["num"]
    pair = lambda a, b: x[x["stratum"].isin([a, b])].groupby(KEY)["num"].sum().reindex(tot.index).fillna(0)
    p1, p2 = pair("sem combate", "abandono parcial"), pair("guardou arma", "morreu para a spike")
    det = r[r["result"] == "Bomb detonated"][["match_id", "round_num"]]
    hit = tot[tot > 0].reset_index()[["match_id", "round_num"]]
    only_det = len(hit.merge(det, how="left", indicator=True).query("_merge == 'left_only'")) == 0
    ok = bool((tot == p1).all() and (tot == p2).all() and only_det)
    out.append({"metric_id": "RET-12", "check": "cada par de estratos soma o total e só há casos em rounds com explosão", "valor": float(tot.sum()),
                "n": len(tot), "passou": ok})
    a = enriched[(enriched["metric_id"] == "OPN-15") & (enriched["stratum"] == "sofreu")][["num", "den"]].sum()
    b = enriched[enriched["metric_id"] == "OPN-12"][["num", "den"]].sum()
    out.append({"metric_id": "OPN-15", "check": "estrato 'sofreu' = OPN-12", "valor": float(a["num"]), "n": int(b["num"]),
                "passou": bool(abs(a["num"] - b["num"]) < 1e-9 and abs(a["den"] - b["den"]) < 1e-9)})

    # ---------------- LEV: coerência do modelo de pressão
    lv = {m: enriched[enriched["metric_id"] == m].set_index(KEY)["num"] for m in ("LEV-01", "LEV-02", "LEV-04")}
    if len(lv["LEV-01"]):
        wp, wm = lv["LEV-01"], lv["LEV-02"].reindex(lv["LEV-01"].index)
        opp_idx = pd.MultiIndex.from_arrays([wp.index.get_level_values(0), wp.index.get_level_values(1),
                                             wp.index.get_level_values(2).map({"Red": "Blue", "Blue": "Red"})])
        wm_opp = lv["LEV-02"].reindex(opp_idx).to_numpy()
        ok = float(np.mean(np.abs(wp.to_numpy() + wm_opp - 1) < 1e-9))
        out.append({"metric_id": "LEV-01", "check": "W+ do time + W− do adversário = 1 em cada round", "valor": ok, "n": len(wp), "passou": bool(ok == 1.0)})
        ok = float(np.mean((wm.to_numpy() >= -1e-12) & (wm.to_numpy() <= wp.to_numpy() + 1e-12) & (wp.to_numpy() <= 1 + 1e-12)))
        out.append({"metric_id": "LEV-02", "check": "0 ≤ W− ≤ W+ ≤ 1", "valor": ok, "n": len(wp), "passou": bool(ok == 1.0)})
        li = lv["LEV-04"]
        li_opp = li.reindex(pd.MultiIndex.from_arrays([li.index.get_level_values(0), li.index.get_level_values(1),
                                                       li.index.get_level_values(2).map({"Red": "Blue", "Blue": "Red"})])).to_numpy()
        ok = float(np.mean(np.abs(li.to_numpy() - li_opp) < 1e-9))
        out.append({"metric_id": "LEV-04", "check": "LI igual para os dois times no mesmo round", "valor": ok, "n": len(li), "passou": bool(ok == 1.0)})
        m = float(li.mean())
        out.append({"metric_id": "LEV-04", "check": "LI médio da base = 1 (referência)", "valor": m, "n": len(li), "passou": bool(abs(m - 1) < 1e-9)})
        # o vencedor do mapa, no último round (que venceu), chega a W+ = 1
        last = tr.loc[tr.groupby("match_id")["round_num"].idxmax()]
        last = last[last["won"].astype(bool)]
        got = wp.reindex(pd.MultiIndex.from_frame(last[KEY])).to_numpy()
        ok = float(np.mean(np.abs(got - 1) < 1e-9)) if len(got) else np.nan
        out.append({"metric_id": "LEV-01", "check": "W+ = 1 no round final para o vencedor do mapa", "valor": ok, "n": len(got), "passou": bool(ok == 1.0)})
        a = set(enriched[enriched["metric_id"] == "LEV-13"].set_index(KEY).index)
        b = set(enriched[enriched["metric_id"] == "TRD-01"].set_index(KEY).index)
        out.append({"metric_id": "LEV-13", "check": "mesmos time-rounds (mortes elegíveis) de TRD-01", "valor": float(a == b), "n": len(a), "passou": a == b})

    # ---------------- AGT / HAL: somas por composição/half batem com as métricas-mãe e com campos oficiais
    def tot(mid, by=KEY):
        x = enriched[enriched["metric_id"] == mid]
        return x.groupby(by)[["num", "den"]].sum()

    per_map = ["match_id", "team_id"]
    for child, parent, what, by in (("AGT-14", "OPN-02", "first bloods convertidos", KEY), ("AGT-15", "TRD-01", "mortes trocadas", KEY),
                                    ("AGT-16", "POS-01", "plants convertidos", KEY), ("AGT-17", "RET-01", "defuses", KEY),
                                    ("HAL-02", "KEY-01", "pistols vencidos", KEY),
                                    ("HAL-03", "KEY-02", "rounds 2/14 após vencer o pistol, por time-mapa", per_map)):
        a, b = tot(child, by), tot(parent, by)
        j = a.join(b, how="outer", lsuffix="_c", rsuffix="_p").fillna(0)
        ok = float(((j["num_c"] - j["num_p"]).abs() < 1e-9).mean() * ((j["den_c"] - j["den_p"]).abs() < 1e-9).mean()) if len(j) else np.nan
        out.append({"metric_id": child, "check": f"Σ por estrato = {parent} ({what})", "valor": ok,
                    "n": len(j), "passou": bool(ok == 1.0)})

    # AGT-11: Σ vitórias por composição = teams[].roundsWon (campo oficial), por time-mapa
    a11 = enriched[enriched["metric_id"] == "AGT-11"].groupby(["match_id", "team_id"])["num"].sum()
    tw = t["teams"].set_index(["match_id", "team_id"])["rounds_won"]
    j = pd.concat([a11.rename("calc"), tw.rename("riot")], axis=1, join="inner")
    ok = float((j["calc"] == j["riot"]).mean()) if len(j) else np.nan
    out.append({"metric_id": "AGT-11", "check": "Σ rounds vencidos por composição = teams[].roundsWon", "valor": ok,
                "n": len(j), "passou": bool(ok == 1.0)})

    # AGT-01 / AGT-03: todo time-mapa tem composição de 5 agentes e as funções somam 5 (catálogo cobre todos)
    a1 = enriched[enriched["metric_id"] == "AGT-01"]
    n_tm = len(t["teams"])
    out.append({"metric_id": "AGT-01", "check": "time-mapas com composição válida / time-mapas", "valor": len(a1) / n_tm if n_tm else np.nan,
                "n": n_tm, "passou": bool(len(a1) == n_tm)})
    a3 = enriched[enriched["metric_id"] == "AGT-03"].groupby(["match_id", "team_id"])["num"].sum()
    ok = float((a3 == 5).mean()) if len(a3) else np.nan
    out.append({"metric_id": "AGT-03", "check": "funções somam 5 em cada time-mapa (catálogo cobre todos os agentes)", "valor": ok,
                "n": len(a3), "passou": bool(ok == 1.0)})

    # AGT-23: plants e defuses por agente = rounds com plant/defuse (campos oficiais)
    a23 = enriched[enriched["metric_id"] == "AGT-23"]
    for ev, col in (("plant", "has_plant"), ("defuse", "has_defuse")):
        calc = float(a23[a23["stratum"].str.startswith(ev + " |")]["num"].sum())
        n_off = int(r[col].sum())
        out.append({"metric_id": "AGT-23", "check": f"Σ {ev}s por agente = rounds com {ev} (bombPlanter/bombDefuser)", "valor": calc,
                    "n": n_off, "passou": bool(calc == n_off)})

    # HAL-12: abertura 3-0 recalculada direto de roundResults[].winningTeam (sem team_rounds)
    rr = r[(~r["is_overtime"]) & (r["round_num"] < 24)].copy()
    rr["h"] = np.where(rr["round_num"] < 12, 0, 12)
    rr = rr[rr["round_num"] - rr["h"] < 3]
    calc = []
    for (mid, h), g in rr.groupby(["match_id", "h"]):
        if len(g) == 3:
            for tid in ("Red", "Blue"):
                calc.append(((mid, h, tid), float((g["winning_team"] == tid).all())))
    exp = dict(calc)
    h12 = enriched[enriched["metric_id"] == "HAL-12"]
    got = {(m, rn, tid): n for m, rn, tid, n in zip(h12["match_id"], h12["round_num"], h12["team_id"], h12["num"])}
    ok = float(np.mean([got.get(k) == v for k, v in exp.items()])) if exp else np.nan
    out.append({"metric_id": "HAL-12", "check": "aberturas 3-0 recalculadas de roundResults[].winningTeam", "valor": ok,
                "n": len(exp), "passou": bool(ok == 1.0)})
    return pd.DataFrame(out)


# ============================================================ 3. cenário sintético
RED = [f"R{i}" for i in range(1, 6)]
BLUE = [f"B{i}" for i in range(1, 6)]
# Agentes do cenário (UUIDs do catálogo): Red = Jett, Sova, Omen, Killjoy, Skye; Blue = Jett, Sova, Omen, Cypher, Raze
AGENT = {"R1": "add6443a-41bd-e414-f6ad-e58d267f4e95", "R2": "320b2a48-4d9b-a075-30f1-1f93a9b638fa",
         "R3": "8e253930-4c05-31dd-1b6c-968525494517", "R4": "1e58de9c-4950-5125-93e9-a0aee9f98746",
         "R5": "6f2a04ca-43e0-be17-7f36-b3908627744d", "B1": "add6443a-41bd-e414-f6ad-e58d267f4e95",
         "B2": "320b2a48-4d9b-a075-30f1-1f93a9b638fa", "B3": "8e253930-4c05-31dd-1b6c-968525494517",
         "B4": "117ed9e3-49f3-6512-3ccf-0cada7e3823b", "B5": "f94c3b30-42be-e959-889c-5aa313dba261"}
RED_COMP = "Jett · Killjoy · Omen · Skye · Sova"
POS = {"R1": (0, 0), "R2": (500, 0), "R3": (4000, 0), "R4": (4000, 4000), "R5": (8000, 0),
       "B1": (1000, 1000), "B2": (6000, 6000), "B3": (7000, 6000), "B4": (8000, 6000), "B5": (9000, 6000)}

# Valores esperados calculados à mão (ver docstring de synthetic_match). Chave: (métrica, time, estrato).
EXPECTED = {
    ("TRD-01", "time_vermelho", ""): 1 / 7, ("TRD-01", "time_azul", ""): 0.0,
    ("TRD-02", "time_vermelho", ""): 2.0,
    ("TRD-03", "time_vermelho", ""): 6 / 7,
    ("OPN-01", "time_vermelho", ""): 2 / 3, ("OPN-02", "time_vermelho", ""): 1 / 2,
    ("OPN-03", "time_vermelho", ""): 1.0, ("OPN-07", "time_vermelho", ""): 1.0,
    ("OPN-08", "time_vermelho", ""): 1 / 2,
    ("KEY-01", "time_vermelho", ""): 1.0, ("KEY-01", "time_azul", ""): 0.0,
    ("KEY-02", "time_vermelho", ""): 1.0, ("KEY-03", "time_azul", ""): 0.0,
    ("KEY-06", "time_vermelho", ""): 1.0, ("KEY-15", "time_azul", ""): 0.0, ("KEY-08", "time_vermelho", ""): 0.0,
    ("KEY-11", "time_azul", "1v5"): 1 / 2, ("KEY-11", "time_azul", "1v3"): 0.0,
    ("KEY-12", "time_vermelho", ""): 1 / 2, ("KEY-12", "time_azul", ""): 0.0,
    ("POS-01", "time_vermelho", ""): 1.0, ("RET-01", "time_azul", ""): 0.0,
    ("POS-04", "time_vermelho", ""): 0.0, ("POS-12", "time_vermelho", ""): 1.0,
    ("POS-03", "time_vermelho", ""): 40.0, ("POS-13", "time_vermelho", ""): 10.0, ("POS-14", "time_vermelho", ""): 0.0,
    ("RET-11", "time_azul", "não defusou"): -3.0, ("RET-12", "time_azul", ""): 0.0,  # plant aos 40 s, B2 mata R2 aos 50 s
    ("DYN-04", "time_vermelho", ""): 1 / 3, ("DYN-04", "time_azul", ""): 1.0,
    ("DYN-05", "time_vermelho", ""): (1 + 0 + 5) / 3,
    ("DYN-01", "time_vermelho", "+4"): 1 / 2, ("DYN-02", "time_azul", "-4"): 1 / 2,
    ("ECO-01", "time_vermelho", ""): (4000 + 19500 + 19500) / 3,
    ("ECO-09", "time_azul", ""): 1 / 2,
    ("TRD-07", "time_vermelho", ""): 5 / 7,
    # composição (AGT): Red tem 2 iniciadores; 3 agentes em comum com o Blue
    ("AGT-03", "time_vermelho", "Iniciador"): 2.0, ("AGT-03", "time_vermelho", "Controlador"): 1.0,
    ("AGT-04", "time_vermelho", ""): 1.0, ("AGT-04", "time_vermelho", "Duelista"): 0.0, ("AGT-04", "time_azul", "Duelista"): 1.0,
    ("AGT-05", "time_vermelho", ""): 1.0, ("AGT-08", "time_vermelho", ""): 0.0, ("AGT-09", "time_vermelho", ""): 3 / 5,
    ("AGT-11", "time_vermelho", RED_COMP): 2 / 3, ("AGT-14", "time_vermelho", RED_COMP): 1 / 2,
    ("AGT-15", "time_vermelho", RED_COMP): 1 / 7, ("AGT-16", "time_vermelho", RED_COMP): 1.0,
    ("AGT-23", "time_vermelho", "plant | Omen"): 1.0, ("AGT-23", "time_vermelho", "trade | Sova"): 1.0,
    # abertura de half (HAL): Red venceu r1 e r2 e perdeu r3; Blue o inverso
    ("HAL-02", "time_vermelho", "1º half"): 1.0, ("HAL-02", "time_azul", "1º half"): 0.0,
    ("HAL-03", "time_vermelho", "1º half"): 1.0,
    ("HAL-04", "time_vermelho", "2-0"): 0.0, ("HAL-04", "time_azul", "0-2"): 1.0,
    ("HAL-05", "time_vermelho", ""): 1.0, ("HAL-05", "time_azul", ""): -1.0,
    ("HAL-07", "time_vermelho", ""): 0.0, ("HAL-10", "time_vermelho", ""): 0.0,
    ("HAL-12", "time_vermelho", ""): 0.0, ("HAL-12", "time_azul", ""): 0.0,
    ("HAL-13", "time_vermelho", "r2"): float(np.log((19500 + 1000) / (2000 + 1000))),
    ("HAL-18", "time_vermelho", "1º half"): 2 / 3,
    # vantagem/desvantagem por situação e por tempo (DYN-09..13)
    ("DYN-09", "time_vermelho", "geral"): 2 / 3, ("DYN-09", "time_vermelho", "5v4"): 1 / 2, ("DYN-09", "time_vermelho", "3v2"): 1.0,
    ("DYN-10", "time_azul", "geral"): 1 / 3, ("DYN-10", "time_azul", "4v5"): 1 / 2, ("DYN-10", "time_vermelho", "geral"): 1.0,
    ("DYN-11", "time_vermelho", "revertida"): 6.0, ("DYN-11", "time_azul", "revertida"): 23.0, ("DYN-11", "time_azul", "não revertida"): 10.0,
    ("DYN-12", "time_vermelho", "mantida até o fim"): 1.0, ("DYN-12", "time_vermelho", "mais de 15 s"): 0.0,
    ("DYN-12", "time_azul", "até 5 s"): 0.0, ("DYN-12", "time_azul", "5–15 s"): 0.0,
    ("DYN-13", "time_vermelho", "até 5 s"): 1.0, ("DYN-13", "time_vermelho", "5–15 s"): 1.0,
    ("DYN-13", "time_azul", "mais de 15 s"): 1.0, ("DYN-13", "time_azul", "não revertida"): 0.0,
    # first blood: Blue abre r0 e é trocado em 2 s; os FBs do Red (r1, r2) não são trocados
    ("OPN-13", "time_vermelho", ""): 0.0, ("OPN-13", "time_azul", ""): 1.0, ("OPN-14", "time_vermelho", ""): 0.0,
    ("OPN-15", "time_vermelho", "fez"): 0.0, ("OPN-15", "time_vermelho", "sofreu"): 0.0,
    ("OPN-15", "time_azul", "fez"): 1.0, ("OPN-15", "time_azul", "sofreu"): 1.0,
    # armamento (razão 0,67 / 1,5; pistol fora): Red superior em r1 (venceu) e r2 (perdeu)
    ("ECO-13", "time_vermelho", "superior"): 1 / 2, ("ECO-13", "time_azul", "inferior"): 1 / 2,
    # trade sofrido = TRD-01 do adversário; mortes sem trade isoladas
    ("TRD-13", "time_vermelho", ""): 0.0, ("TRD-13", "time_azul", ""): 1 / 7, ("TRD-14", "time_vermelho", ""): 5 / 6,
}


def _wp_forward(a: int, b: int, k: int, first_atk: bool, pa: float) -> float:
    """P(vencer o mapa) por distribuição para frente (implementação independente de leverage.g_state)."""
    dist = {(a, b): 1.0}
    win = 0.0
    for r in range(k, 24):
        p = pa if (r < 12) == first_atk else 1 - pa
        nxt = {}
        for (x, y), q in dist.items():
            for (nx, ny), w in (((x + 1, y), p), ((x, y + 1), 1 - p)):
                if nx == 13:
                    win += q * w
                elif ny < 13:
                    nxt[(nx, ny)] = nxt.get((nx, ny), 0.0) + q * w
        dist = nxt
    return win + 0.5 * dist.get((12, 12), 0.0)  # prorrogação entre times médios: 50%


def _lev_expected() -> dict:
    """Partida sintética: Ascent, Red ataca nos 3 rounds; taxa do ataque = 2/3 (r0 e r1 vencidos pelo ataque)."""
    pa = 2 / 3
    sc = [(0, 0), (1, 0), (2, 0)]  # placar do Red antes de r0, r1, r2
    L = [_wp_forward(x + 1, y, k + 1, True, pa) - _wp_forward(x, y + 1, k + 1, True, pa) for k, (x, y) in enumerate(sc)]
    won = [1, 1, 0]
    S = sum(L)
    return {
        ("LEV-04", "time_vermelho", ""): 1.0, ("LEV-04", "time_azul", ""): 1.0,
        ("LEV-03", "time_vermelho", ""): S / 3,
        ("LEV-08", "time_vermelho", ""): (L[0] + L[1]) / S, ("LEV-08", "time_azul", ""): L[2] / S,
        # um só confronto: p_pre cai para a taxa do lado no mapa (Red no ataque = 2/3)
        ("LEV-09", "time_vermelho", ""): sum(l * (w - pa) for l, w in zip(L, won)) / S,
        ("LEV-12", "time_vermelho", ""): L[1] / (L[1] + L[2]),
        ("LEV-13", "time_vermelho", ""): L[0] / (2 * L[0] + 5 * L[2]),
        ("LEV-06", "time_vermelho", ""): (L[0] + L[1]) / 2 / (S / 3),
    }


EXPECTED.update(_lev_expected())


def synthetic_match() -> dict:
    """Partida sintética de 3 rounds (Red ataca em todos).

    r0 (pistol): B1 mata R1 (20 s, first blood azul); R2 troca em 2 s (22 s). R3 planta no A aos 40 s
        (4v4). B2 mata R2 (50 s); Red elimina B2–B5 (60–63 s). Red vence.
    r1: Red full (19 500) x Blue eco (2 000). R1 mata os 5 (15, 30, 31, 32, 33 s). Flawless do Red.
    r2: Red full (19 500) x Blue half (10 000). Red mata B1–B4 (10–16 s); B5 sozinho mata R1–R5
        (30–34 s): clutch 1v5 do Blue.
    """
    players = RED + BLUE
    team = {p: ("Red" if p in RED else "Blue") for p in players}
    loadouts = {0: {p: 800 for p in players},
                1: {**{p: 3900 for p in RED}, **{p: 400 for p in BLUE}},
                2: {**{p: 3900 for p in RED}, **{p: 2000 for p in BLUE}}}
    script = {
        0: [(20000, "B1", "R1"), (22000, "R2", "B1"), (50000, "B2", "R2"), (60000, "R3", "B2"),
            (61000, "R4", "B3"), (62000, "R5", "B4"), (63000, "R5", "B5")],
        1: [(15000, "R1", "B1"), (30000, "R1", "B2"), (31000, "R1", "B3"), (32000, "R1", "B4"), (33000, "R1", "B5")],
        2: [(10000, "R1", "B1"), (12000, "R2", "B2"), (14000, "R3", "B3"), (16000, "R4", "B4"),
            (30000, "B5", "R1"), (31000, "B5", "R2"), (32000, "B5", "R3"), (33000, "B5", "R4"), (34000, "B5", "R5")],
    }
    meta = {0: ("Red", "Attacker", "CeremonyDefault"), 1: ("Red", "Attacker", "CeremonyFlawless"),
            2: ("Blue", "Defender", "CeremonyClutch")}

    def loc(p):
        return {"x": POS[p][0], "y": POS[p][1]}

    rounds = []
    for rn, kills in script.items():
        dead = set()
        stats = {p: {"puuid": p, "kills": [], "damage": [], "score": 0,
                     "economy": {"loadoutValue": loadouts[rn][p], "spent": loadouts[rn][p], "remaining": 0,
                                 "weapon": f"w-{loadouts[rn][p]}", "armor": ""},
                     "ability": {}} for p in players}
        for t_ms, killer, victim in kills:
            snap = [{"puuid": p, "viewRadians": 0.0, "location": loc(p)} for p in players if p not in dead and p != victim]
            stats[killer]["kills"].append({
                "timeSinceGameStartMillis": rn * 200000 + t_ms, "timeSinceRoundStartMillis": t_ms,
                "killer": killer, "victim": victim, "victimLocation": loc(victim), "assistants": [],
                "playerLocations": snap,
                "finishingDamage": {"damageType": "Weapon", "damageItem": "w", "isSecondaryFireMode": False}})
            stats[killer]["damage"].append({"receiver": victim, "damage": 150, "legshots": 0, "bodyshots": 1, "headshots": 1})
            dead.add(victim)
        win, role, cer = meta[rn]
        plant = rn == 0
        alive_at_plant = [p for p in players if p not in ("R1", "B1")]
        rounds.append({
            "roundNum": rn, "roundResult": "Eliminated", "roundCeremony": cer, "winningTeam": win,
            "winningTeamRole": role, "bombPlanter": "R3" if plant else None, "bombDefuser": None,
            "plantRoundTime": 40000 if plant else 0,
            "plantPlayerLocations": [{"puuid": p, "viewRadians": 0.0, "location": loc(p)} for p in alive_at_plant] if plant else None,
            "plantLocation": {"x": 4000, "y": 100} if plant else {"x": 0, "y": 0}, "plantSite": "A" if plant else "",
            "defuseRoundTime": 0, "defusePlayerLocations": None, "defuseLocation": {"x": 0, "y": 0},
            "playerStats": list(stats.values()), "roundResultCode": "Elimination"})
    return {
        "matchInfo": {"matchId": "synthetic-0001", "mapId": "/Game/Maps/Ascent/Ascent", "gameVersion": "test",
                      "gameLengthMillis": 600000, "gameStartMillis": 0, "isCompleted": True,
                      "gameMode": "/Game/GameModes/Bomb/BombGameMode.BombGameMode_C", "provisioningFlowId": "CustomGame"},
        "players": [{"puuid": p, "gameName": p, "tagLine": "0", "teamId": team[p], "partyId": "", "characterId": AGENT[p],
                     "isObserver": False, "stats": {"score": 0, "roundsPlayed": 3, "kills": 0, "deaths": 0, "assists": 0,
                                                    "abilityCasts": {}}} for p in players],
        "coaches": [],
        "teams": [{"teamId": "Red", "won": True, "roundsPlayed": 3, "roundsWon": 2, "numPoints": 2},
                  {"teamId": "Blue", "won": False, "roundsPlayed": 3, "roundsWon": 1, "numPoints": 1}],
        "roundResults": rounds,
    }


def run_scenario(cfg) -> pd.DataFrame:
    """Roda o pipeline completo na partida sintética e compara com EXPECTED."""
    from .pipeline import compute
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / "Univavá" / "Classificatória 1"
        d.mkdir(parents=True)
        name = "UNIVAVA_C1_999_01-01-26_time_vermelho_2_x_1_time_azul_ascent.json"
        (d / name).write_text(json.dumps(synthetic_match()), encoding="utf-8")
        res = compute(cfg, data_dir=Path(tmp), quiet=True)
    team = res["metrics_team"].set_index(["metric_id", "team_name", "stratum"])["value"]
    rows = []
    for (mid, tname, strat), exp in EXPECTED.items():
        got = team.get((mid, tname, strat), np.nan)
        ok = bool(np.isfinite(got) and abs(got - exp) < 1e-6)
        rows.append({"metric_id": mid, "time": tname, "estrato": strat, "esperado": exp, "obtido": got, "passou": ok})
    return pd.DataFrame(rows)
