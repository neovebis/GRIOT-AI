from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from typing import Iterable


@dataclass(frozen=True, slots=True)
class LexicalResolution:
    surface: str
    lemma: str
    relation: str | None
    source: str
    confidence: float = 0.94


class SemanticLexicon:
    """Deterministic lexical normalization for Portuguese semantic parsing.

    The registry only maps explicitly curated lexical variants to canonical
    semantic relations. It never creates a new entity or relation from an
    unknown token.
    """

    CANONICAL_RELATIONS = {
        "atacar": "attacks",
        "comer": "eats",
        "ver": "sees",
        "usar": "uses",
        "construir": "builds",
        "criar": "creates",
        "dar": "gives",
        "ajudar": "helps",
        "ferir": "hurts",
        "querer": "wants",
        "precisar": "needs",
        "saber": "knows",
        "causar": "causes",
        "provocar": "causes",
        "ter": "has",
        "possuir": "has",
        "ser": "is_a",
        "estar": "located_in",
        "habitar": "located_in",
    }

    ALIASES = {
        "agredir": "atacar",
        "atentar": "atacar",
        "ingerir": "comer",
        "observar": "ver",
        "enxergar": "ver",
        "utilizar": "usar",
        "empregar": "usar",
        "edificar": "construir",
        "erguer": "construir",
        "produzir": "criar",
        "elaborar": "criar",
        "auxiliar": "ajudar",
        "socorrer": "ajudar",
        "lesionar": "ferir",
        "machucar": "ferir",
        "desejar": "querer",
        "necessitar": "precisar",
        "conhecer": "saber",
        "ocasionar": "causar",
        "gerar": "causar",
        "residir": "habitar",
        "morar": "habitar",
        "situar": "estar",
        "localizar": "estar",
    }

    # Phrase-level paraphrases whose argument direction is stable.
    RELATION_PHRASES = (
        (r"^(.+?)\s+(?:é|e)\s+(?:parte integrante|parte)\s+(?:de|do|da|dos|das)\s+(.+)$", "part_of"),
        (r"^(.+?)\s+(?:é|e)\s+integrante\s+(?:de|do|da|dos|das)\s+(.+)$", "member_of"),
        (r"^(.+?)\s+(?:é|e)\s+(?:composto|constituído|constituido)\s+(?:por|pelo|pela|pelos|pelas)\s+(.+)$", "composed_of"),
        (r"^(.+?)\s+(?:está|esta)\s+(?:localizado|localizada|situado|situada)\s+(?:em|no|na|nos|nas)\s+(.+)$", "located_in"),
        (r"^(.+?)\s+(?:encontra-se|encontra se)\s+(?:em|no|na|nos|nas)\s+(.+)$", "located_in"),
        (r"^(.+?)\s+(?:reside|mora|habita)\s+(?:em|no|na|nos|nas)\s+(.+)$", "located_in"),
        (r"^(.+?)\s+(?:é|e)\s+(?:causado|causada)\s+por\s+(.+)$", "caused_by"),
    )

    _GENERATED_FORMS: dict[str, str] | None = None
    AMBIGUOUS_FORMS = frozenset({"a", "e", "o", "as", "os", "em", "am", "um", "uma", "esta", "este", "essa", "esse"})

    @staticmethod
    def normalize(value: str) -> str:
        return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).casefold().strip())

    @classmethod
    def canonical_lemma(cls, value: str) -> str:
        key = cls.normalize(value)
        if key in cls.CANONICAL_RELATIONS:
            return key
        if key in cls.ALIASES:
            return cls.ALIASES[key]
        return cls._generated_forms().get(key, key)

    @classmethod
    def relation_for_verb(cls, value: str) -> str | None:
        key = cls.normalize(value)
        if key in cls.CANONICAL_RELATIONS:
            return cls.CANONICAL_RELATIONS[key]
        if key in cls.ALIASES:
            return cls.CANONICAL_RELATIONS[cls.ALIASES[key]]
        lemma = cls._generated_forms().get(key)
        return cls.CANONICAL_RELATIONS.get(lemma)

    @classmethod
    def resolve_verb(cls, value: str) -> LexicalResolution | None:
        key = cls.normalize(value)
        if key in cls.CANONICAL_RELATIONS:
            return LexicalResolution(key, key, cls.CANONICAL_RELATIONS[key], "canonical", 0.99)
        if key in cls.ALIASES:
            lemma = cls.ALIASES[key]
            return LexicalResolution(key, lemma, cls.CANONICAL_RELATIONS[lemma], "alias", 0.95)
        forms = cls._generated_forms()
        lemma = forms.get(key)
        if lemma is None:
            return None
        return LexicalResolution(key, lemma, cls.CANONICAL_RELATIONS.get(lemma), "inflection", 0.93)

    @classmethod
    def relation_patterns(cls) -> tuple[tuple[re.Pattern[str], str], ...]:
        return tuple((re.compile(pattern, re.I), relation) for pattern, relation in cls.RELATION_PHRASES)

    @classmethod
    def _generated_forms(cls) -> dict[str, str]:
        if cls._GENERATED_FORMS is not None:
            return cls._GENERATED_FORMS

        verbs = set(cls.CANONICAL_RELATIONS) | set(cls.ALIASES)
        forms: dict[str, str] = {}
        for lemma in verbs:
            forms.setdefault(lemma, cls.ALIASES.get(lemma, lemma))
            if lemma.endswith("ar"):
                stem = lemma[:-2]
                paradigms = (
                    (("o", "as", "a", "amos", "ais", "am"), "present"),
                    (("ei", "aste", "ou", "amos", "astes", "aram"), "past_perfect"),
                    (("ava", "avas", "ava", "ávamos", "áveis", "avam"), "past_imperfect"),
                )
            elif lemma.endswith("er"):
                stem = lemma[:-2]
                paradigms = (
                    (("o", "es", "e", "emos", "eis", "em"), "present"),
                    (("i", "este", "eu", "emos", "estes", "eram"), "past_perfect"),
                    (("ia", "ias", "ia", "íamos", "íeis", "iam"), "past_imperfect"),
                )
            elif lemma.endswith("ir"):
                stem = lemma[:-2]
                paradigms = (
                    (("o", "es", "e", "imos", "is", "em"), "present"),
                    (("i", "iste", "iu", "imos", "istes", "iram"), "past_perfect"),
                    (("ia", "ias", "ia", "íamos", "íeis", "iam"), "past_imperfect"),
                )
            else:
                continue
            for suffixes, _ in paradigms:
                for suffix in suffixes:
                    form = cls.normalize(stem + suffix)
                    if len(form) >= 4 and form not in cls.AMBIGUOUS_FORMS:
                        forms.setdefault(form, lemma)

        cls._GENERATED_FORMS = forms
        return forms

    @classmethod
    def analyze(cls, text: str) -> tuple[LexicalResolution, ...]:
        tokens = re.findall(r"[\wÀ-ÿ]+(?:['’-][\wÀ-ÿ]+)?", text, re.UNICODE)
        out: list[LexicalResolution] = []
        for token in tokens:
            resolution = cls.resolve_verb(token)
            if resolution is not None:
                out.append(resolution)
        return tuple(out)

    @classmethod
    def relation_from_clause(cls, clause: str) -> str | None:
        normalized = cls.normalize(clause)
        for pattern, relation in cls.relation_patterns():
            if pattern.match(normalized):
                return relation
        return None

    @classmethod
    def canonical_signature(cls, value: str) -> tuple[str, str | None]:
        resolution = cls.resolve_verb(value)
        if resolution is None:
            return (cls.normalize(value), None)
        return (resolution.lemma, resolution.relation)


def lexical_resolutions(values: Iterable[str]) -> tuple[LexicalResolution, ...]:
    return tuple(
        resolution
        for value in values
        if (resolution := SemanticLexicon.resolve_verb(value)) is not None
    )


__all__ = [
    "LexicalResolution",
    "SemanticLexicon",
    "lexical_resolutions",
]
