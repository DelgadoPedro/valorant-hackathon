"""Carrega config.yaml e resolve caminhos relativos à raiz do projeto."""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Config:
    raw: dict[str, Any]
    root: Path

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    @property
    def data_dir(self) -> Path:
        # normpath (e não resolve) para preservar atalhos/links e manter caminhos relativos legíveis
        return Path(os.path.normpath(self.root / self.raw["paths"]["data_dir"]))

    @property
    def output_dir(self) -> Path:
        return (self.root / self.raw["paths"]["output_dir"]).resolve()

    @property
    def dictionary_path(self) -> Path:
        return (self.root / self.raw["paths"]["dictionary"]).resolve()

    @property
    def agents_catalog_path(self) -> Path:
        return (self.root / self.raw["paths"].get("agents_catalog", "reference/agents_catalog.csv")).resolve()

    @property
    def fingerprint(self) -> str:
        """Hash curto da configuração — gravado nas saídas para rastreabilidade."""
        blob = json.dumps(self.raw, sort_keys=True).encode()
        return hashlib.sha256(blob).hexdigest()[:12]


def load_config(path: str | Path | None = None, data_dir: str | Path | None = None) -> Config:
    cfg_path = Path(path) if path else PROJECT_ROOT / "config.yaml"
    with open(cfg_path, encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    if data_dir is not None:
        raw["paths"]["data_dir"] = str(Path(data_dir).resolve())
    return Config(raw=raw, root=cfg_path.resolve().parent)
