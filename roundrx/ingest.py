"""Camada 1: leitura dos JSONs -> inventário (manifest) + tabelas canônicas.

Nada aqui interpreta tática; só achata o JSON em tabelas com chaves estáveis:
match_id, round_num (0-based), puuid, team_id (Red/Blue dentro da partida) e team_name
(identidade entre partidas, vinda do nome do arquivo e validada pelo placar).
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pandas as pd

FNAME_RE = re.compile(
    r"^(?P<prefix>.+?)_(?P<series>\d+[a-z]?)_(?P<date>\d{2}-\d{2}-\d{2})_"
    r"(?P<team_a>.+)_(?P<score_a>\d+)_x_(?P<score_b>\d+)_(?P<team_b>.+)_(?P<map>[a-z]+)$"
)

COMPETITION_BY_PREFIX = {
    "RUSHE": ("Rush Series", "Esquenta"),
    "RUSH2": ("Rush Series", "Esquenta 2"),
    "RUSH_INCLUSIVO": ("Rush Series", "Inclusivo"),
    "UNIVAVA_C1": ("Univavá", "Classificatória 1"),
    "UNIVAVA_C2": ("Univavá", "Classificatória 2"),
    "UNIVAVA_C3": ("Univavá", "Classificatória 3"),
    "UNIVAVA_C4": ("Univavá", "Classificatória 4"),
    "UNIVAVA_G": ("Univavá", "Fase de Grupos"),
}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_filename(stem: str) -> dict:
    m = FNAME_RE.match(stem)
    if not m:
        return {"parse_ok": False}
    d = m.groupdict()
    comp, stage = COMPETITION_BY_PREFIX.get(d["prefix"], ("?", d["prefix"]))
    dd, mm, yy = d["date"].split("-")
    return {
        "parse_ok": True,
        "prefix": d["prefix"],
        "competition": comp,
        "stage": stage,
        "series": d["series"],
        "date": f"20{yy}-{mm}-{dd}",
        "team_a": d["team_a"],
        "score_a": int(d["score_a"]),
        "team_b": d["team_b"],
        "score_b": int(d["score_b"]),
        "map_token": d["map"],
    }


def list_files(data_dir: Path) -> list[Path]:
    return sorted(p for p in data_dir.rglob("*.json"))


def _kill_type(killer, victim, killer_team, victim_team, damage_type) -> str:
    if damage_type == "Bomb":
        return "bomb"
    if not killer or killer == victim:
        return "self"
    if killer_team is None or victim_team is None:
        return "unknown"
    return "team" if killer_team == victim_team else "enemy"


def ingest(data_dir: Path) -> dict[str, pd.DataFrame]:
    files = list_files(data_dir)
    if not files:
        raise FileNotFoundError(f"Nenhum JSON encontrado em {data_dir}")

    manifest, matches, teams, players = [], [], [], []
    rounds, round_players, kills, kill_pos, obj_pos, damage = [], [], [], [], [], []

    for path in files:
        rel = path.relative_to(data_dir).as_posix()
        meta = parse_filename(path.stem)
        rec = {"file": rel, "bytes": path.stat().st_size, "sha256": _sha256(path), **meta}
        with open(path, encoding="utf-8") as fh:
            j = json.load(fh)
        mi = j["matchInfo"]
        match_id = mi["matchId"]
        rec["match_id"] = match_id

        # --- times: casa nome do arquivo com Red/Blue pelo placar --------------------
        t_by_id = {t["teamId"]: t for t in j["teams"]}
        names = {}
        issues = []
        if meta.get("parse_ok"):
            for tid, t in t_by_id.items():
                if t["roundsWon"] == meta["score_a"] and t["roundsWon"] != meta["score_b"]:
                    names[tid] = meta["team_a"]
                elif t["roundsWon"] == meta["score_b"] and t["roundsWon"] != meta["score_a"]:
                    names[tid] = meta["team_b"]
            if len(names) != 2:
                issues.append("placar do arquivo não casa com teams[].roundsWon")
        else:
            issues.append("nome de arquivo fora do padrão")
        for tid in t_by_id:
            names.setdefault(tid, f"{match_id[:8]}_{tid}")
        rec["issues"] = "; ".join(issues)
        manifest.append(rec)

        team_of = {p["puuid"]: p["teamId"] for p in j["players"] if not p.get("isObserver")}
        observers = {p["puuid"] for p in j["players"] if p.get("isObserver")}

        matches.append({
            "match_id": match_id,
            "file": rel,
            "competition": meta.get("competition"),
            "stage": meta.get("stage"),
            "series": meta.get("series"),
            "date": meta.get("date"),
            "map_code": mi["mapId"].rsplit("/", 1)[-1],
            "map_name": (meta.get("map_token") or "").capitalize() or None,
            "game_start_ms": mi.get("gameStartMillis"),
            "game_length_ms": mi.get("gameLengthMillis"),
            "game_version": mi.get("gameVersion"),
            "is_completed": mi.get("isCompleted"),
            "n_rounds": len(j["roundResults"]),
            "n_players": len(j["players"]),
            "n_observers": len(observers),
            "red_name": names.get("Red"),
            "blue_name": names.get("Blue"),
            "red_score": t_by_id.get("Red", {}).get("roundsWon"),
            "blue_score": t_by_id.get("Blue", {}).get("roundsWon"),
            "winner_name": next((names[t["teamId"]] for t in j["teams"] if t.get("won")), None),
        })
        for tid, t in t_by_id.items():
            other = next(o for o in t_by_id if o != tid)
            teams.append({
                "match_id": match_id, "team_id": tid, "team_name": names[tid],
                "opponent_name": names[other], "rounds_won": t["roundsWon"],
                "rounds_played": t.get("roundsPlayed"), "won": bool(t.get("won")),
            })
        for p in j["players"]:
            st = p.get("stats") or {}
            ab = st.get("abilityCasts") or {}
            players.append({
                "match_id": match_id, "puuid": p["puuid"],
                "riot_id": f'{p.get("gameName")}#{p.get("tagLine")}',
                "team_id": p["teamId"], "team_name": names.get(p["teamId"]),
                "character_id": p.get("characterId"), "is_observer": bool(p.get("isObserver")),
                "kills": st.get("kills"), "deaths": st.get("deaths"), "assists": st.get("assists"),
                "score": st.get("score"), "rounds_played": st.get("roundsPlayed"),
                "grenade_casts": ab.get("grenadeCasts"), "ability1_casts": ab.get("ability1Casts"),
                "ability2_casts": ab.get("ability2Casts"), "ultimate_casts": ab.get("ultimateCasts"),
            })

        for r in j["roundResults"]:
            rn = r["roundNum"]
            win, role = r.get("winningTeam"), r.get("winningTeamRole")
            other = next((o for o in t_by_id if o != win), None)
            atk = win if role == "Attacker" else other
            dfn = other if role == "Attacker" else win
            planter = r.get("bombPlanter")
            defuser = r.get("bombDefuser")
            pl = r.get("plantLocation") or {}
            dl = r.get("defuseLocation") or {}
            rounds.append({
                "match_id": match_id, "round_num": rn,
                "result": r.get("roundResult"), "result_code": r.get("roundResultCode") or None,
                "ceremony": r.get("roundCeremony"),
                "winning_team": win, "winning_role": role,
                "atk_team": atk, "def_team": dfn,
                "planter": planter, "planter_team": team_of.get(planter),
                "plant_time_ms": r.get("plantRoundTime") if planter else None,
                "plant_site": (r.get("plantSite") or None) if planter else None,
                "plant_x": pl.get("x") if planter else None, "plant_y": pl.get("y") if planter else None,
                "defuser": defuser, "defuser_team": team_of.get(defuser),
                "defuse_time_ms": r.get("defuseRoundTime") if defuser else None,
                "defuse_x": dl.get("x") if defuser else None, "defuse_y": dl.get("y") if defuser else None,
            })
            for ev, key in (("plant", "plantPlayerLocations"), ("defuse", "defusePlayerLocations")):
                for loc in r.get(key) or []:
                    if loc["puuid"] in observers:
                        continue
                    obj_pos.append({
                        "match_id": match_id, "round_num": rn, "event": ev, "puuid": loc["puuid"],
                        "team_id": team_of.get(loc["puuid"]),
                        "x": loc["location"]["x"], "y": loc["location"]["y"],
                        "view": loc.get("viewRadians"),
                    })
            raw_kills = []
            for ps in r.get("playerStats") or []:
                pu = ps["puuid"]
                if pu in observers:
                    continue
                eco = ps.get("economy") or {}
                dmg_enemy = dmg_team = 0
                for d in ps.get("damage") or []:
                    rt = team_of.get(d["receiver"])
                    same = rt == team_of.get(pu)
                    if same:
                        dmg_team += d.get("damage", 0)
                    else:
                        dmg_enemy += d.get("damage", 0)
                    damage.append({
                        "match_id": match_id, "round_num": rn, "attacker": pu, "receiver": d["receiver"],
                        "attacker_team": team_of.get(pu), "receiver_team": rt,
                        "damage": d.get("damage", 0), "headshots": d.get("headshots", 0),
                        "bodyshots": d.get("bodyshots", 0), "legshots": d.get("legshots", 0),
                    })
                round_players.append({
                    "match_id": match_id, "round_num": rn, "puuid": pu, "team_id": team_of.get(pu),
                    "loadout_value": eco.get("loadoutValue"), "spent": eco.get("spent"),
                    "remaining": eco.get("remaining"), "weapon_id": (eco.get("weapon") or "").lower() or None,
                    "armor_id": (eco.get("armor") or "").lower() or None, "score": ps.get("score"),
                    "damage_to_enemies": dmg_enemy, "damage_to_team": dmg_team,
                    "kills_n": len(ps.get("kills") or []),
                })
                raw_kills.extend(ps.get("kills") or [])
            raw_kills.sort(key=lambda k: (k.get("timeSinceRoundStartMillis", 0), k.get("timeSinceGameStartMillis", 0)))
            for idx, k in enumerate(raw_kills):
                fd = k.get("finishingDamage") or {}
                kt, vt = team_of.get(k.get("killer")), team_of.get(k.get("victim"))
                vl = k.get("victimLocation") or {}
                snap = k.get("playerLocations") or []
                kills.append({
                    "match_id": match_id, "round_num": rn, "kill_idx": idx,
                    "t_ms": k.get("timeSinceRoundStartMillis"), "t_game_ms": k.get("timeSinceGameStartMillis"),
                    "killer": k.get("killer"), "victim": k.get("victim"),
                    "killer_team": kt, "victim_team": vt,
                    "kill_type": _kill_type(k.get("killer"), k.get("victim"), kt, vt, fd.get("damageType")),
                    "damage_type": fd.get("damageType"), "damage_item": (fd.get("damageItem") or "").lower() or None,
                    "is_secondary_fire": fd.get("isSecondaryFireMode"),
                    "victim_x": vl.get("x"), "victim_y": vl.get("y"),
                    "n_assists": len(k.get("assistants") or []),
                    "assistants": ",".join(k.get("assistants") or []),
                    "snapshot_n": len(snap),
                })
                for loc in snap:
                    if loc["puuid"] in observers:
                        continue
                    kill_pos.append({
                        "match_id": match_id, "round_num": rn, "kill_idx": idx, "puuid": loc["puuid"],
                        "team_id": team_of.get(loc["puuid"]),
                        "x": loc["location"]["x"], "y": loc["location"]["y"], "view": loc.get("viewRadians"),
                    })

    out = {
        "manifest": pd.DataFrame(manifest),
        "matches": pd.DataFrame(matches),
        "teams": pd.DataFrame(teams),
        "players": pd.DataFrame(players),
        "rounds": pd.DataFrame(rounds),
        "round_players": pd.DataFrame(round_players),
        "kills": pd.DataFrame(kills),
        "kill_positions": pd.DataFrame(kill_pos),
        "objective_positions": pd.DataFrame(obj_pos),
        "damage": pd.DataFrame(damage),
    }
    _enrich(out)
    return out


def _enrich(t: dict[str, pd.DataFrame]) -> None:
    """Colunas derivadas simples e determinísticas (sem limiares)."""
    m = t["matches"].set_index("match_id")
    r = t["rounds"]
    r["round_display"] = r["round_num"] + 1
    r["is_overtime"] = r["round_num"] >= 24
    r["half"] = r["round_num"].map(lambda n: 1 if n < 12 else (2 if n < 24 else 3))
    r["is_pistol"] = r["round_num"].isin([0, 12])
    r["has_plant"] = r["planter"].notna()
    r["has_defuse"] = r["defuser"].notna()
    names = t["teams"].set_index(["match_id", "team_id"])["team_name"]
    r["atk_name"] = [names.get((a, b)) for a, b in zip(r["match_id"], r["atk_team"])]
    r["def_name"] = [names.get((a, b)) for a, b in zip(r["match_id"], r["def_team"])]
    r["map_name"] = r["match_id"].map(m["map_name"])
    # Fim do round quando observável: defuse, ou detonação (spike explode 45 s após o plant).
    # Kills depois disso (pós-round) e mortes pela spike não mudam o resultado -> fora das métricas táticas.
    r["round_end_ms"] = r["defuse_time_ms"].where(r["has_defuse"],
                                                  (r["plant_time_ms"] + 45000).where(r["result"] == "Bomb detonated"))
    k = t["kills"]
    end = k.merge(r[["match_id", "round_num", "round_end_ms"]], on=["match_id", "round_num"], how="left")["round_end_ms"]
    k["after_round_end"] = (pd.Series(k["t_ms"].to_numpy(float) > end.fillna(float("inf")).to_numpy(float), index=k.index)
                            & (k["kill_type"] != "bomb"))
    k["in_play"] = ~k["after_round_end"] & (k["kill_type"] != "bomb")
    # Nome do mapa: derivado do nome do arquivo e validado (codinome -> nome único)
    mm = t["matches"].groupby("map_code")["map_name"].nunique()
    t["matches"]["map_name_conflict"] = t["matches"]["map_code"].map(mm) > 1
