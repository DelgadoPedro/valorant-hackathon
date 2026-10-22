"""Importar este pacote registra todas as métricas em REGISTRY."""
from . import agents, eco, fights, halves, leverage, objective, rounds, spatial  # noqa: F401
from .base import REGISTRY, Context, run_all  # noqa: F401
