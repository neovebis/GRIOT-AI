from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class VerbResolution:
    lemma: str


class SemanticLexicon:
    """Lexical semantic resolver for Portuguese verbal morphology, nominalizations, and passives."""

    _PASSIVE_MAP: dict[str, str] = {
        "atacado": "attacks",
        "atacada": "attacks",
        "atacados": "attacks",
        "atacadas": "attacks",
        "visto": "sees",
        "vista": "sees",
        "vistos": "sees",
        "vistas": "sees",
        "comido": "eats",
        "comida": "eats",
        "comidos": "eats",
        "comidas": "eats",
        "construido": "builds",
        "construída": "builds",
        "construida": "builds",
        "construído": "builds",
        "construidos": "builds",
        "construídos": "builds",
        "usado": "uses",
        "usada": "uses",
        "usados": "uses",
        "usadas": "uses",
        "habitado": "inhabits",
        "habitada": "inhabits",
        "criado": "creates",
        "criada": "creates",
        "ajudado": "helps",
        "ajudada": "helps",
        "protegido": "protects",
        "protegida": "protects",
        "destruido": "destroys",
        "destruída": "destroys",
        "ferido": "hurts",
        "ferida": "hurts",
        "mordido": "bites",
        "mordida": "bites",
    }

    _NOMINAL_MAP: dict[str, str] = {
        "ataque": "attacks",
        "construcao": "builds",
        "construção": "builds",
        "criacao": "creates",
        "criação": "creates",
        "destruicao": "destroys",
        "destruição": "destroys",
        "defesa": "defends",
        "protecao": "protects",
        "proteção": "protects",
        "mordida": "bites",
        "ajuda": "helps",
        "visita": "visits",
        "uso": "uses",
        "habitacao": "inhabits",
        "habitação": "inhabits",
    }

    _VERB_MAP: dict[str, str] = {
        "atacar": "attacks",
        "agredir": "attacks",
        "rugir": "roars",
        "habitar": "inhabits",
        "viver": "lives_in",
        "comer": "eats",
        "ver": "sees",
        "usar": "uses",
        "construir": "builds",
        "criar": "creates",
        "ajudar": "helps",
        "proteger": "protects",
        "destruir": "destroys",
        "morder": "bites",
        "ferir": "hurts",
        "possuir": "has",
        "ter": "has",
        "causar": "causes",
        "provocar": "causes",
        "querer": "wants",
        "precisar": "needs",
        "saber": "knows",
        "ser": "is_a",
        "estar": "located_in",
        "dar": "gives",
    }

    _VERB_FORMS: dict[str, str] = {
        "ataca": "atacar",
        "atacou": "atacar",
        "atacam": "atacar",
        "atacava": "atacar",
        "atacará": "atacar",
        "atacara": "atacar",
        "atacando": "atacar",
        "agride": "agredir",
        "agridem": "agredir",
        "agrediu": "agredir",
        "agredir": "agredir",
        "agredia": "agredir",
        "agredindo": "agredir",
        "come": "comer",
        "comeu": "comer",
        "comem": "comer",
        "comia": "comer",
        "comerá": "comer",
        "comendo": "comer",
        "vê": "ver",
        "ve": "ver",
        "viu": "ver",
        "veem": "ver",
        "via": "ver",
        "verá": "ver",
        "vendo": "ver",
        "usa": "usar",
        "usou": "usar",
        "usam": "usar",
        "usava": "usar",
        "usará": "usar",
        "usando": "usar",
        "constrói": "construir",
        "constroi": "construir",
        "construiu": "construir",
        "constroem": "construir",
        "construía": "construir",
        "construirá": "construir",
        "construindo": "construir",
        "cria": "criar",
        "criou": "criar",
        "criam": "criar",
        "criava": "criar",
        "criará": "criar",
        "criando": "criar",
        "ajuda": "ajudar",
        "ajudou": "ajudar",
        "ajudam": "ajudar",
        "ajudava": "ajudar",
        "ajudará": "ajudar",
        "ajudando": "ajudar",
        "habita": "habitar",
        "habitou": "habitar",
        "habitam": "habitar",
        "habitava": "habitar",
        "habitará": "habitar",
        "habitando": "habitar",
        "vive": "viver",
        "viveu": "viver",
        "vivem": "viver",
        "vivia": "viver",
        "viverá": "viver",
        "vivendo": "viver",
        "ruge": "rugir",
        "rugiu": "rugir",
        "rugem": "rugir",
        "rugia": "rugir",
        "rugirá": "rugir",
        "rugindo": "rugir",
        "tem": "ter",
        "teve": "ter",
        "tinha": "ter",
        "terá": "ter",
        "tendo": "ter",
        "possui": "possuir",
        "possuiu": "possuir",
        "possuem": "possuir",
        "possuía": "possuir",
        "possuirá": "possuir",
        "possuindo": "possuir",
        "causa": "causar",
        "causou": "causar",
        "causam": "causar",
        "causava": "causar",
        "causará": "causar",
        "causando": "causar",
        "provoca": "provocar",
        "provocou": "provocar",
        "provocam": "provocar",
        "provocava": "provocar",
        "provocará": "provocar",
        "provocando": "provocar",
    }

    @classmethod
    def relation_patterns(cls) -> tuple[tuple[re.Pattern[str], str], ...]:
        return ()

    @classmethod
    def passive_relation(cls, participle: str) -> str | None:
        return cls._PASSIVE_MAP.get(participle.lower().strip())

    @classmethod
    def nominalization_relation(cls, nominal: str) -> str | None:
        return cls._NOMINAL_MAP.get(nominal.lower().strip())

    @classmethod
    def relation_for_verb(cls, lemma: str) -> str | None:
        return cls._VERB_MAP.get(lemma.lower().strip())

    @classmethod
    def resolve_verb(cls, key: str) -> VerbResolution | None:
        clean = key.lower().strip()
        if clean in cls._VERB_FORMS:
            return VerbResolution(lemma=cls._VERB_FORMS[clean])
        if clean in cls._VERB_MAP:
            return VerbResolution(lemma=clean)
        return None
