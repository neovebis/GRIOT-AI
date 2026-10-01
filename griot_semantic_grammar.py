from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import TYPE_CHECKING, Iterable, Mapping

from griot_language import LanguageAnalysis, LanguageClause, LanguageIntelligence
from griot_lexical_semantics import SemanticLexicon

if TYPE_CHECKING:
    from griot_engine import GRIOT


@dataclass(frozen=True, slots=True)
class VerbFrame:
    lemma: str
    relation: str
    transitivity: str
    governed_prepositions: tuple[str, ...] = ()
    subject_kinds: tuple[str, ...] = ()
    object_kinds: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SelectionalCheck:
    relation: str
    subject: str | None
    object: str | None
    status: str
    violations: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Coordination:
    operator: str
    side: str
    members: tuple[str, ...]
    semantics: str
    status: str


@dataclass(frozen=True, slots=True)
class AgreementIssue:
    code: str
    surface: str
    expected: str
    actual: str
    message: str


@dataclass(frozen=True, slots=True)
class QuerySpec:
    kind: str
    variable: str
    relation: str | None
    anchor: str | None
    direction: str | None
    confidence: float = 0.92


@dataclass(frozen=True, slots=True)
class GovernanceCheck:
    relation: str
    required: tuple[str, ...]
    found: str | None
    status: str


@dataclass(frozen=True, slots=True)
class GrammarAnalysis:
    text: str
    frames: tuple[VerbFrame, ...]
    selectional: tuple[SelectionalCheck, ...]
    coordination: tuple[Coordination, ...]
    agreement: tuple[AgreementIssue, ...]
    governance: tuple[GovernanceCheck, ...]
    queries: tuple[QuerySpec, ...]
    abstain_reasons: tuple[str, ...]

    @property
    def valid(self) -> bool:
        return (
            not any(item.status == "invalid" for item in self.selectional)
            and not self.agreement
            and not any(item.status == "invalid" for item in self.governance)
            and not any(item.status == "invalid" for item in self.coordination)
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "valid": self.valid,
            "frames": [
                {
                    "lemma": item.lemma,
                    "relation": item.relation,
                    "transitivity": item.transitivity,
                    "governed_prepositions": item.governed_prepositions,
                    "subject_kinds": item.subject_kinds,
                    "object_kinds": item.object_kinds,
                }
                for item in self.frames
            ],
            "selectional": [
                {
                    "relation": item.relation,
                    "subject": item.subject,
                    "object": item.object,
                    "status": item.status,
                    "violations": item.violations,
                }
                for item in self.selectional
            ],
            "coordination": [
                {
                    "operator": item.operator,
                    "side": item.side,
                    "members": item.members,
                    "semantics": item.semantics,
                    "status": item.status,
                }
                for item in self.coordination
            ],
            "agreement": [
                {
                    "code": item.code,
                    "surface": item.surface,
                    "expected": item.expected,
                    "actual": item.actual,
                    "message": item.message,
                }
                for item in self.agreement
            ],
            "governance": [
                {
                    "relation": item.relation,
                    "required": item.required,
                    "found": item.found,
                    "status": item.status,
                }
                for item in self.governance
            ],
            "queries": [
                {
                    "kind": item.kind,
                    "variable": item.variable,
                    "relation": item.relation,
                    "anchor": item.anchor,
                    "direction": item.direction,
                    "confidence": item.confidence,
                }
                for item in self.queries
            ],
            "abstain_reasons": self.abstain_reasons,
        }


class SemanticGrammar:
    """Deterministic semantic grammar layer adapted from the stronger QUID front-end.

    It adds executable valency, selectional restrictions, coordination semantics,
    agreement validation, preposition governance and question-variable extraction
    without bypassing GIR or the atomic QUID contract.
    """

    VERB_FRAMES: Mapping[str, VerbFrame] = {
        "atacar": VerbFrame("atacar", "attacks", "transitive", (), ("animal", "person"), ("animal", "person")),
        "comer": VerbFrame("comer", "eats", "transitive", (), ("animal", "person"), ("food",)),
        "ver": VerbFrame("ver", "sees", "transitive", (), ("animal", "person"), ("entity",)),
        "usar": VerbFrame("usar", "uses", "transitive", (), ("animal", "person"), ("artifact",)),
        "construir": VerbFrame("construir", "builds", "transitive", (), ("person", "animal"), ("artifact", "entity")),
        "criar": VerbFrame("criar", "creates", "transitive", (), ("person", "animal"), ("artifact", "entity")),
        "dar": VerbFrame("dar", "gives", "transitive", (), ("person", "animal"), ("entity",)),
        "ajudar": VerbFrame("ajudar", "helps", "transitive", (), ("person", "animal"), ("person", "animal", "entity")),
        "ferir": VerbFrame("ferir", "hurts", "transitive", (), ("person", "animal"), ("person", "animal")),
        "querer": VerbFrame("querer", "wants", "transitive", (), ("person", "animal"), ("entity",)),
        "precisar": VerbFrame("precisar", "needs", "transitive", ("de",), ("person", "animal"), ("entity",)),
        "saber": VerbFrame("saber", "knows", "transitive", (), ("person", "animal"), ("entity",)),
        "ter": VerbFrame("ter", "has", "transitive", (), ("entity",), ("entity",)),
        "possuir": VerbFrame("possuir", "has", "transitive", (), ("entity",), ("entity",)),
        "ser": VerbFrame("ser", "is_a", "copulative"),
        "estar": VerbFrame("estar", "located_in", "relational", ("em", "no", "na", "nos", "nas"), ("entity",), ("location",)),
        "habitar": VerbFrame("habitar", "located_in", "relational", ("em", "no", "na", "nos", "nas"), ("entity",), ("location",)),
        "viver": VerbFrame("viver", "located_in", "relational", ("em", "no", "na", "nos", "nas"), ("entity",), ("location",)),
    }

    # Small deterministic semantic seed. It is deliberately extensible and is
    # only a fallback when durable graph typing is unavailable.
    LEXICAL_KINDS: Mapping[str, frozenset[str]] = {
        "leão": frozenset({"animal", "entity"}),
        "lobo": frozenset({"animal", "entity"}),
        "raposa": frozenset({"animal", "entity"}),
        "gato": frozenset({"animal", "entity"}),
        "cão": frozenset({"animal", "entity"}),
        "caes": frozenset({"animal", "entity"}),
        "cães": frozenset({"animal", "entity"}),
        "joão": frozenset({"person", "entity"}),
        "maria": frozenset({"person", "entity"}),
        "pessoa": frozenset({"person", "entity"}),
        "carne": frozenset({"food", "entity"}),
        "pão": frozenset({"food", "entity"}),
        "paes": frozenset({"food", "entity"}),
        "pães": frozenset({"food", "entity"}),
        "água": frozenset({"entity"}),
        "carro": frozenset({"artifact", "vehicle", "entity"}),
        "veículo": frozenset({"artifact", "vehicle", "entity"}),
        "veiculo": frozenset({"artifact", "vehicle", "entity"}),
        "motor": frozenset({"artifact", "part", "entity"}),
        "roda": frozenset({"artifact", "part", "entity"}),
        "livro": frozenset({"artifact", "entity"}),
        "caneta": frozenset({"artifact", "instrument", "entity"}),
        "casa": frozenset({"location", "artifact", "entity"}),
        "escola": frozenset({"location", "entity"}),
        "floresta": frozenset({"location", "entity"}),
        "savana": frozenset({"location", "entity"}),
        "erosão": frozenset({"entity"}),
        "erosao": frozenset({"entity"}),
        "fumaça": frozenset({"entity"}),
        "fumaca": frozenset({"entity"}),
    }

    NOUN_FEATURES: Mapping[str, tuple[str | None, str | None]] = {
        "leão": ("m", "sing"), "leões": ("m", "plur"), "leao": ("m", "sing"),
        "lobo": ("m", "sing"), "lobos": ("m", "plur"),
        "raposa": ("f", "sing"), "raposas": ("f", "plur"),
        "gato": ("m", "sing"), "gatos": ("m", "plur"),
        "cão": ("m", "sing"), "cães": ("m", "plur"), "caes": ("m", "plur"),
        "carro": ("m", "sing"), "carros": ("m", "plur"),
        "livro": ("m", "sing"), "livros": ("m", "plur"),
        "caneta": ("f", "sing"), "canetas": ("f", "plur"),
        "casa": ("f", "sing"), "casas": ("f", "plur"),
        "escola": ("f", "sing"), "escolas": ("f", "plur"),
        "colega": (None, "sing"), "colegas": (None, "plur"),
        "pessoa": ("f", "sing"), "pessoas": ("f", "plur"),
        "motor": ("m", "sing"), "motores": ("m", "plur"),
        "roda": ("f", "sing"), "rodas": ("f", "plur"),
        "floresta": ("f", "sing"), "florestas": ("f", "plur"),
        "savana": ("f", "sing"), "savanas": ("f", "plur"),
    }

    DETERMINER_FEATURES: Mapping[str, tuple[str | None, str | None]] = {
        "o": ("m", "sing"), "a": ("f", "sing"),
        "os": ("m", "plur"), "as": ("f", "plur"),
        "um": ("m", "sing"), "uma": ("f", "sing"),
        "uns": ("m", "plur"), "umas": ("f", "plur"),
        "este": ("m", "sing"), "esta": ("f", "sing"),
        "estes": ("m", "plur"), "estas": ("f", "plur"),
        "esse": ("m", "sing"), "essa": ("f", "sing"),
        "esses": ("m", "plur"), "essas": ("f", "plur"),
    }

    ADJECTIVE_FEATURES: Mapping[str, tuple[str | None, str | None]] = {
        "feroz": ("m", "sing"), "ferozes": (None, "plur"),
        "manso": ("m", "sing"), "mansa": ("f", "sing"),
        "grande": (None, "sing"), "grandes": (None, "plur"),
        "bonito": ("m", "sing"), "bonita": ("f", "sing"),
        "bonitos": ("m", "plur"), "bonitas": ("f", "plur"),
    }

    @staticmethod
    def _norm(value: str) -> str:
        return unicodedata.normalize("NFKC", value).casefold().strip()

    def __init__(self, engine: GRIOT | None = None) -> None:
        self.engine = engine

    def frame_for_clause(
        self,
        clause: LanguageClause,
        language: LanguageAnalysis | None = None,
    ) -> VerbFrame | None:
        verb = self._norm(clause.verb or "")
        lexical = SemanticLexicon.resolve_verb(verb) if verb else None
        lemma = lexical.lemma if lexical is not None else LanguageIntelligence.VERB_LEMMAS.get(verb, verb)
        canonical_lemma = SemanticLexicon.canonical_lemma(lemma)
        frame = self.VERB_FRAMES.get(lemma) or self.VERB_FRAMES.get(canonical_lemma)
        if frame is not None:
            return frame
        if language is not None and verb:
            token = next(
                (
                    item for item in language.tokens
                    if self._norm(item.text) == verb and item.lemma
                ),
                None,
            )
            if token is not None:
                return self.VERB_FRAMES.get(self._norm(token.lemma))
        if verb.endswith("ando"):
            return self.VERB_FRAMES.get(f"{verb[:-4]}ar")
        if verb.endswith("endo"):
            return self.VERB_FRAMES.get(f"{verb[:-4]}er")
        if verb.endswith("indo"):
            return self.VERB_FRAMES.get(f"{verb[:-4]}ir")
        return None

    def analyze(self, text: str, language: LanguageAnalysis | None = None) -> GrammarAnalysis:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        if not text.strip():
            raise ValueError("text must not be empty")
        language = language or LanguageIntelligence().analyze(text)

        frames: list[VerbFrame] = []
        selections: list[SelectionalCheck] = []
        coordinations: list[Coordination] = []
        agreement = list(self._agreement_issues(text, language))
        governance: list[GovernanceCheck] = []
        queries = list(self._queries(text))
        abstain: list[str] = []

        for clause in language.clauses:
            frame = self.frame_for_clause(clause, language)
            if frame is None:
                if clause.verb:
                    abstain.append(f"unsupported-verb:{self._norm(clause.verb)}")
                continue
            frames.append(frame)
            selection = self._selection(frame, clause)
            selections.append(selection)
            governance.append(self._governance(frame, clause))
            coordinations.extend(self._coordination(clause, frame))
            if selection.status == "invalid":
                abstain.append("selectional-restriction")
            if selection.status == "unknown":
                abstain.append("selectional-typing-unknown")

        for item in governance:
            if item.status == "invalid":
                abstain.append("preposition-governance")

        if agreement:
            abstain.append("agreement-error")

        if any(item.status in {"unknown", "invalid"} for item in coordinations):
            abstain.append("coordination-boundary")

        return GrammarAnalysis(
            text,
            tuple(dict.fromkeys(frames)),
            tuple(selections),
            tuple(coordinations),
            tuple(agreement),
            tuple(governance),
            tuple(queries),
            tuple(dict.fromkeys(abstain)),
        )

    def _selection(self, frame: VerbFrame, clause: LanguageClause) -> SelectionalCheck:
        subject_kinds = self._kinds(clause.subject)
        object_kinds = self._kinds(self._argument_surface(clause.object, frame.governed_prepositions))
        violations: list[str] = []
        unknown = False

        if frame.subject_kinds and clause.subject:
            status = self._matches_any(subject_kinds, frame.subject_kinds)
            if status is False:
                violations.append(f"subject:{clause.subject}")
            elif status is None:
                unknown = True
        if frame.object_kinds and clause.object:
            status = self._matches_any(object_kinds, frame.object_kinds)
            if status is False:
                violations.append(f"object:{clause.object}")
            elif status is None:
                unknown = True

        if violations:
            return SelectionalCheck(frame.relation, clause.subject, clause.object, "invalid", tuple(violations))
        if unknown:
            return SelectionalCheck(frame.relation, clause.subject, clause.object, "unknown")
        return SelectionalCheck(frame.relation, clause.subject, clause.object, "valid")

    @staticmethod
    def coordination_truth(operator: str, values: Iterable[bool]) -> bool:
        """Return the truth condition for a coordinated phrase."""
        if operator not in {"e", "ou"}:
            raise ValueError("operator must be e or ou")
        items = tuple(values)
        if not items:
            raise ValueError("coordination requires at least one value")
        return all(items) if operator == "e" else any(items)

    @staticmethod
    def _matches_any(kinds: frozenset[str], required: tuple[str, ...]) -> bool | None:
        if not kinds:
            return None
        if "entity" in required and "entity" in kinds:
            return True
        if any(item in kinds for item in required):
            return True
        return False

    def _argument_surface(self, surface: str | None, governed: tuple[str, ...] = ()) -> str | None:
        if not surface:
            return None
        value = self._norm(surface).strip(" ,;:.!?")
        for prep in governed:
            prefix = prep + " "
            if value.startswith(prefix):
                return value[len(prefix):].strip(" ,;:.!?")
        return value

    def _kinds(self, surface: str | None) -> frozenset[str]:
        if not surface:
            return frozenset()
        normalized = self._argument_surface(surface) or ""
        normalized = self._strip_determiner(normalized) or normalized
        base = set(self.LEXICAL_KINDS.get(normalized, ()))
        quid = self.engine.quids.get(surface) if self.engine is not None else None
        if quid is not None and hasattr(self.engine, "graph"):
            for item in self.engine.graph.query(quid.symbol, "is_a", None):
                fact = item.fact if hasattr(item, "fact") else item
                target = self.engine.quids.get(fact.object)
                if target is not None:
                    label = self._norm(target.label)
                    if label in {"animal", "pessoa", "person", "food", "alimento", "artifact", "objeto", "location", "local", "entity"}:
                        base.add({"pessoa": "person", "food": "food", "alimento": "food", "artifact": "artifact", "objeto": "artifact", "location": "location", "local": "location"}.get(label, label))
            if quid.family_id == 1:
                base.add("entity")
        return frozenset(base)

    def _coordination(self, clause: LanguageClause, frame: VerbFrame) -> tuple[Coordination, ...]:
        raw = clause.text
        found: list[Coordination] = []
        for operator in ("e", "ou"):
            pattern = re.compile(rf"\s+{operator}\s+", re.I)
            if not pattern.search(raw):
                continue
            semantics = "all" if operator == "e" else "any"
            words = raw.split()
            verb_index = None
            if clause.verb:
                for index, word in enumerate(words):
                    if self._norm(word) == self._norm(clause.verb):
                        verb_index = index
                        break
            if verb_index is None:
                continue

            left = " ".join(words[:verb_index]).strip(" ,;")
            right = " ".join(words[verb_index + 1:]).strip(" ,;")
            side = "subject" if re.search(rf"\s+{operator}\s+", left, re.I) else "object"
            value = left if side == "subject" else right
            pieces = tuple(
                p.strip(" ,;:!?")
                for p in re.split(rf"\s+{operator}\s+", value, flags=re.I)
                if p.strip(" ,;:!?")
            )
            if len(pieces) < 2:
                continue
            required = frame.subject_kinds if side == "subject" else frame.object_kinds
            statuses = [self._matches_any(self._kinds(part), required) for part in pieces]
            if operator == "e":
                status = "valid" if statuses and all(value is True for value in statuses) else (
                    "invalid" if any(value is False for value in statuses) else "unknown"
                )
            else:
                status = "valid" if any(value is True for value in statuses) else (
                    "unknown" if any(value is None for value in statuses) else "invalid"
                )
            found.append(Coordination(operator, side, pieces, semantics, status))
        return tuple(found)

    def _governance(self, frame: VerbFrame, clause: LanguageClause) -> GovernanceCheck:
        if not frame.governed_prepositions:
            return GovernanceCheck(frame.relation, (), None, "not_required")
        raw = self._norm(clause.text)
        found = None
        for prep in frame.governed_prepositions:
            if re.search(rf"(?<!\w){re.escape(prep)}(?!\w)", raw):
                found = prep
                break
        if found is None:
            return GovernanceCheck(frame.relation, frame.governed_prepositions, None, "invalid")
        return GovernanceCheck(frame.relation, frame.governed_prepositions, found, "valid")

    def _agreement_issues(self, text: str, language: LanguageAnalysis) -> tuple[AgreementIssue, ...]:
        words = [self._norm(x) for x in re.findall(r"[\wÀ-ÿ]+", text, re.UNICODE)]
        issues: list[AgreementIssue] = []

        for index, word in enumerate(words[:-1]):
            determiner = self.DETERMINER_FEATURES.get(word)
            noun = self.NOUN_FEATURES.get(words[index + 1])
            if determiner is None or noun is None:
                continue
            expected_gender, expected_number = noun
            actual_gender, actual_number = determiner
            if expected_gender is not None and actual_gender is not None and expected_gender != actual_gender:
                issues.append(AgreementIssue("noun-article-gender", f"{word} {words[index + 1]}", f"{expected_gender}", actual_gender, "determinante e nome discordam em género"))
            if expected_number is not None and actual_number is not None and expected_number != actual_number:
                issues.append(AgreementIssue("noun-article-number", f"{word} {words[index + 1]}", expected_number, actual_number, "determinante e nome discordam em número"))

        for index, word in enumerate(words):
            adjective = self.ADJECTIVE_FEATURES.get(word)
            if adjective is None:
                continue
            noun_index = next(
                (j for j in range(index - 1, -1, -1) if words[j] in self.NOUN_FEATURES),
                None,
            )
            if noun_index is None:
                continue
            noun_gender, noun_number = self.NOUN_FEATURES[words[noun_index]]
            adj_gender, adj_number = adjective
            if noun_gender is not None and adj_gender is not None and noun_gender != adj_gender:
                issues.append(AgreementIssue("adjective-gender", word, noun_gender, adj_gender, "adjetivo e nome discordam em género"))
            if noun_number is not None and adj_number is not None and noun_number != adj_number:
                issues.append(AgreementIssue("adjective-number", word, noun_number, adj_number, "adjetivo e nome discordam em número"))

        for clause in language.clauses:
            if not clause.subject or not clause.verb:
                continue
            subject_words = [self._norm(x) for x in clause.subject.split()]
            subject_features = next(
                (self.NOUN_FEATURES[word] for word in reversed(subject_words) if word in self.NOUN_FEATURES),
                None,
            )
            verb_token = next(
                (token for token in language.tokens if self._norm(token.text) == self._norm(clause.verb) and token.number is not None),
                None,
            )
            if subject_features is None or verb_token is None:
                continue
            _, subject_number = subject_features
            if subject_number is not None and verb_token.number is not None and subject_number != verb_token.number:
                issues.append(
                    AgreementIssue(
                        "subject-verb-number",
                        f"{clause.subject} {clause.verb}",
                        subject_number,
                        verb_token.number,
                        "sujeito e verbo discordam em número",
                    )
                )

        return tuple(dict.fromkeys(issues))

    def _queries(self, text: str) -> tuple[QuerySpec, ...]:
        raw = self._norm(text).strip(" ?.!;:")
        patterns: tuple[tuple[str, str, str | None, str | None, str | None], ...] = (
            (r"^(?:o que|quem)\s+causa\s+(?:o|a|os|as)\s+(.+)$", "subject", "causes", "causes", "forward"),
            (r"^o que\s+tem\s+(?:o|a|os|as)\s+(.+)$", "object", "has", "has", "forward"),
            (r"^quem\s+tem\s+(?:o|a|os|as)\s+(.+)$", "subject", "has", "has", "forward"),
            (r"^onde\s+(?:esta|está|fica|vive)\s+(.+)$", "location", "located_in", "located_in", "forward"),
            (r"^quem\s+(ataca|atacou|come|comeu|viu|usa|usou|ajuda|ajudou|fere|feriu|precisa|precisou|sabe|soube|quer|queria|querem|cria|criou|criam|constrói|construiu|ajuda|ajudou|fere|feriu)\s+(.+)$", "subject", None, None, "forward"),
            (r"^o que\s+(.+?)\s+(ataca|atacou|come|comeu|viu|usou|usa|ajuda|ajudou|fere|feriu|quer|queria|querem|cria|criou|criam|constrói|construiu|constrói|usou|usa|precisa|precisou|sabe|soube)$", "object", None, None, "forward"),
            (r"^o que\s+(.+?)\s+(ataca|atacou|come|comeu|viu|usou|usa|ajuda|ajudou|fere|feriu)\s+(.+)$", "object", None, None, "forward"),
            (r"^o que\s+(.+?)\s+tem$", "object", "has", "has", "forward"),
        )
        out: list[QuerySpec] = []
        for pattern, kind, fixed_relation, _label, direction in patterns:
            match = re.match(pattern, raw, re.I)
            if not match:
                continue
            groups = match.groups()
            if kind == "location":
                anchor = self._strip_determiner(groups[0])
                out.append(QuerySpec("location", "?x", "located_in", anchor, direction))
            elif kind == "subject":
                if fixed_relation == "causes":
                    anchor = self._strip_determiner(groups[0])
                    out.append(QuerySpec("subject", "?x", "causes", anchor, direction))
                elif fixed_relation == "has":
                    anchor = self._strip_determiner(groups[-1])
                    out.append(QuerySpec("subject", "?x", "has", anchor, direction))
                else:
                    lemma = LanguageIntelligence.VERB_LEMMAS.get(self._norm(groups[0]), self._norm(groups[0]))
                    frame = self.VERB_FRAMES.get(lemma)
                    out.append(QuerySpec("subject", "?x", frame.relation if frame else None, self._strip_determiner(groups[1]), direction))
            elif kind == "object":
                if fixed_relation == "has":
                    anchor = self._strip_determiner(groups[-1])
                    out.append(QuerySpec("object", "?x", "has", anchor, direction))
                else:
                    subject = self._strip_determiner(groups[0])
                    verb = self._norm(groups[1])
                    lemma = LanguageIntelligence.VERB_LEMMAS.get(verb, verb)
                    frame = self.VERB_FRAMES.get(lemma)
                    out.append(QuerySpec("object", "?x", frame.relation if frame else None, subject, direction))
        if re.match(r"^por\s+que\s+", raw, re.I):
            anchor = re.sub(r"^por\s+que\s+", "", raw, flags=re.I).strip()
            out.append(QuerySpec("cause", "?cause", "causes", self._strip_determiner(anchor), "inverse"))
        return tuple(out)

    @staticmethod
    def _strip_determiner(value: str | None) -> str | None:
        if value is None:
            return None
        return re.sub(r"^(?:o|a|os|as|um|uma|uns|umas|do|da|dos|das|no|na|nos|nas)\s+", "", value).strip(" ,;:!?") or None


__all__ = [
    "AgreementIssue",
    "Coordination",
    "GovernanceCheck",
    "GrammarAnalysis",
    "QuerySpec",
    "SelectionalCheck",
    "SemanticGrammar",
    "VerbFrame",
]