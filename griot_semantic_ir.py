from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, replace
from typing import Iterable, Mapping

try:
    from griot_engine import BaseLayer, Fact, GRIOT
except ImportError:
    from griot.types import BaseLayer, Fact
    from griot.engine import GRIOT

from griot_ambiguity import AmbiguityAnalysis, AmbiguityResolver
from griot_coreference import CoreferenceLink, CoreferenceResolver, Mention
from griot_gir import GIR, GIR_RELATION_FAMILIES, MeaningEdge, MeaningNode
from griot_intent import SemanticIntentDetector, SemanticIntent
from griot_metaphor import MetaphorResolver
from griot_polysemy import PolysemyAnalysis, PolysemyResolver
from griot_language import LanguageAnalysis, LanguageIntelligence
from griot_lexical_semantics import SemanticLexicon
from griot_semantic_grammar import SemanticGrammar


@dataclass(frozen=True, slots=True)
class MeaningRepresentation(GIR):
    """Compatibility name for the formal GIR semantic representation.

    Existing semantic callers keep the MeaningRepresentation API while the
    underlying object now satisfies the versioned GIR contract.
    """


class MeaningCompiler:
    RELATION_FAMILY = GIR_RELATION_FAMILIES
    STATEMENTS = (
        (r"^(.*?)\s+faz parte (?:de|do|da|dos|das)\s+(.*?)$", "part_of"),
        (r"^(.*?)\s+pertence a\s+(.*?)$", "member_of"),
        (r"^(.*?)\s+é um\s+(.*?)$", "is_a"),
        (r"^(.*?)\s+é uma\s+(.*?)$", "is_a"),
        (
            r"^(?:seria possível que|seria possivel que|é possível que|e possível que)\s+(.*?)\s+tenha\s+(.*?)$",
            "has",
        ),
        (r"^(.*?)\s+tem\s+(.*?)$", "has"),
        (r"^(.*?)\s+possui\s+(.*?)$", "has"),
        (r"^(.*?)\s+causa\s+(.*?)$", "causes"),
        (r"^(.*?)\s+provoca\s+(.*?)$", "causes"),
        (r"^(.*?)\s+antes de\s+(.*?)$", "before"),
        (r"^(.*?)\s+depois de\s+(.*?)$", "after"),
        (r"^(.*?)\s+(?:está|esta|fica|vive)\s+(?:em|no|na|nos|nas)\s+(.*?)$", "located_in"),
    )
    VERBS = (
        (r"^(.*?)\s+(?:ataca|atacou|atacar)\s+(.*?)$", "attacks"),
        (r"^(.*?)\s+(?:come|comeu|comer)\s+(.*?)$", "eats"),
        (r"^(.*?)\s+(?:vê|ve|viu|ver)\s+(.*?)$", "sees"),
        (r"^(.*?)\s+(?:usa|usou|usar)\s+(.*?)$", "uses"),
        (r"^(.*?)\s+(?:constrói|construiu|construir)\s+(.*?)$", "builds"),
        (r"^(.*?)\s+(?:cria|criou|criar)\s+(.*?)$", "creates"),
        (r"^(.*?)\s+(?:ajuda|ajudou|ajudar)\s+(.*?)$", "helps"),
        (r"^(.*?)\s+(?:fere|feriu|ferir)\s+(.*?)$", "hurts"),
        (r"^(.*?)\s+(?:quer|queria|querer)\s+(.*?)$", "wants"),
        (r"^(.*?)\s+(?:precisa|precisou|precisar)\s+(.*?)$", "needs"),
        (r"^(.*?)\s+(?:sabe|soube|saber)\s+(.*?)$", "knows"),
    )
    MODAL_ACTIONS = ("pode", "deve", "precisa")
    TEMPORAL = {"ontem": "past", "hoje": "present", "agora": "present", "amanhã": "future"}

    def __init__(self, griot: GRIOT) -> None:
        self.griot = griot
        self.ambiguity = AmbiguityResolver(griot)
        self.polysemy = PolysemyResolver(griot)
        self.coreference = CoreferenceResolver(griot)
        self.metaphor = MetaphorResolver()
        self.intent = SemanticIntentDetector()
        self.language = LanguageIntelligence()
        self.grammar = SemanticGrammar(self.griot)
        self._ambiguity_analysis: AmbiguityAnalysis | None = None
        self._polysemy_analysis: PolysemyAnalysis | None = None

    @staticmethod
    def normalize(text: str) -> str:
        value = unicodedata.normalize("NFKC", text).casefold().strip()
        return re.sub(r"\s+", " ", re.sub(r"[.!?;:]+", " ", value))

    @staticmethod
    def clean(value: str) -> str:
        value = re.sub(r"^(um|uma|uns|umas|o|a|os|as)\s+", "", value.strip())
        return value.strip(" ,.")

    def compile(self, text: str) -> MeaningRepresentation:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        normalized = self.normalize(text)
        if not normalized:
            raise ValueError("text must not be empty")
        language_analysis = self.language.analyze(normalized)

        frame = self.griot.understand(normalized)
        semantic_intent = self.intent.detect(normalized, frame)
        self._ambiguity_analysis = self.ambiguity.analyze(
            normalized,
            context_records=self.griot.context.records(),
        )
        ambiguity_map = {
            item.surface: item
            for item in self._ambiguity_analysis.resolutions
        }
        self._polysemy_analysis = self.polysemy.analyze(
            normalized,
            self._ambiguity_analysis,
        )
        nodes: dict[str, MeaningNode] = {}
        edges: list[MeaningEdge] = []
        last_subject: str | None = None
        mentions: list[Mention] = []
        coreference_links: list[CoreferenceLink] = []
        resolved_language_clauses = list(language_analysis.clauses)
        embedding_records: list[dict[str, object]] = []
        coordination_records: list[dict[str, object]] = []
        relative_records: list[dict[str, object]] = []

        for sentence in (x.strip() for x in re.split(r"[.!?]+", text) if x.strip()):
            sentence = self.normalize(sentence)
            if not sentence:
                continue
            negated = bool(re.search(r"\b(?:não|nunca|jamais)\b", sentence))
            # Strip negation only when it is clause-initial. A negation inside
            # an embedded clause must remain in the text used for language
            # clause matching and recursive semantic compilation.
            sentence_clean = re.sub(
                r"^(?:não|nao|nunca|jamais)\s*",
                "",
                sentence,
                count=1,
                flags=re.I,
            ).strip()
            pronoun = re.match(
                r"^(?:(e|mas|porém|porem|contudo|entretanto|depois|então|entao|agora)\s+)?"
                r"(ele|ela|eles|elas|isso|isto|este|esta|esse|essa|aquilo)\s+(.*)$",
                sentence_clean,
                flags=re.I,
            )
            if pronoun:
                discourse_marker, pronoun_surface, pronoun_tail = pronoun.groups()
                link = self.coreference.resolve(
                    pronoun_surface,
                    mentions,
                    context_records=self.griot.context.records(),
                )
                coreference_links.append(link)
                if not link.resolved:
                    continue
                if link.antecedent:
                    sentence_clean = f"{link.antecedent} {pronoun_tail}"
            language_clause_index = next(
                (
                    index for index, clause in enumerate(language_analysis.clauses)
                    if self.normalize(clause.text) == self.normalize(sentence_clean)
                ),
                None,
            )
            language_clause = (
                resolved_language_clauses[language_clause_index]
                if language_clause_index is not None
                else None
            )
            if language_clause is not None:
                language_clause = self._resolve_intrasentence_coreference(
                    language_clause,
                    mentions,
                    coreference_links,
                )
                if language_clause_index is not None:
                    resolved_language_clauses[language_clause_index] = language_clause
            if language_clause is not None and language_clause.coreference_blocked:
                continue
            if (
                language_clause is not None
                and language_clause.subject
                and language_clause.relation
                and language_clause.object
            ):
                parsed = (
                    language_clause.subject,
                    language_clause.relation,
                    language_clause.object,
                )
            else:
                parsed = self._parse(sentence_clean)
            main_negated = (
                language_clause.negated
                if language_clause is not None
                else negated
            )
            if not parsed:
                continue
            subject, relation, object_ = parsed
            subject, object_ = self.clean(subject), self.clean(self._clean_object(object_))
            if not subject or not object_:
                continue
            s = self._node(nodes, subject, "entity", 1, ambiguity_map)
            o = self._node(nodes, object_, "entity", 1, ambiguity_map)
            last_subject = subject
            subject_gender, subject_number = self.coreference.guess_agreement(subject)
            object_gender, object_number = self.coreference.guess_agreement(object_)
            mentions.append(
                Mention(subject, "subject", len(mentions) + 1, subject_gender, subject_number, s.quid)
            )
            mentions.append(
                Mention(object_, "object", len(mentions) + 1, object_gender, object_number, o.quid)
            )
            if relation in {"attacks", "eats", "sees", "uses", "builds", "creates", "gives", "helps", "hurts", "wants", "needs", "knows"}:
                scene = self._event(nodes, relation, subject, object_)
                edges += [
                    MeaningEdge(scene.node_id, "has_agent", s.node_id, 9, 0.94, main_negated, sentence),
                    MeaningEdge(scene.node_id, "has_patient", o.node_id, 4, 0.94, main_negated, sentence),
                ]
            edges.append(
                MeaningEdge(
                    s.node_id,
                    relation,
                    o.node_id,
                    self.RELATION_FAMILY.get(relation, 2),
                    0.92,
                    main_negated,
                    sentence,
                )
            )
            self._constraints(nodes, edges, s, sentence)

            # H15: recursively compile the entire embedded-clause tree.
            # Every recognized proposition is grounded independently while
            # preserving the subordinate path in edge provenance. Unknown
            # predicates are represented only in hierarchy metadata and never
            # become invented semantic relations.
            if language_clause is not None:
                if language_clause.possessive_antecedent and language_clause.possessed:
                    owner = self._node(
                        nodes,
                        self.clean(language_clause.possessive_antecedent),
                        "entity",
                        1,
                        ambiguity_map,
                    )
                    possessed = self._node(
                        nodes,
                        self.clean(language_clause.possessed),
                        "entity",
                        1,
                        ambiguity_map,
                    )
                    edges.append(
                        MeaningEdge(
                            owner.node_id,
                            "has",
                            possessed.node_id,
                            self.RELATION_FAMILY["has"],
                            0.94,
                            False,
                            language_clause.text,
                            f"possessive:1:{language_clause.possessive_marker or 'cujo'}",
                        )
                    )
                for index, relative in enumerate(language_clause.relative):
                    self._compile_relative_tree(
                        relative,
                        nodes,
                        edges,
                        ambiguity_map,
                        depth=1,
                        path=(index,),
                        relativizers=(relative.relativizer or language_clause.relativizer or "relative",),
                        antecedent=language_clause.relative_antecedent,
                        records=relative_records,
                        embedding_records=embedding_records,
                        coordination_records=coordination_records,
                    )
                for index, coordinated in enumerate(language_clause.coordinated):
                    self._compile_coordinated_tree(
                        coordinated,
                        nodes,
                        edges,
                        ambiguity_map,
                        depth=1,
                        path=(index,),
                        coordinators=(language_clause.coordinator or "coord",),
                        records=coordination_records,
                        embedding_records=embedding_records,
                    )
                for index, embedded in enumerate(language_clause.embedded):
                    self._compile_embedded_tree(
                        embedded,
                        nodes,
                        edges,
                        ambiguity_map,
                        depth=1,
                        path=(index,),
                        subordinators=(language_clause.subordinator or "embedded",),
                        records=embedding_records,
                    )

        vector = self._compose_vector(nodes, edges)
        constraints = {
            "numbers": tuple(float(x.replace(",", ".")) for x in re.findall(r"-?\d+(?:[\.,]\d+)?", normalized)),
            "negated": bool(re.search(r"\b(?:não|nunca|jamais)\b", normalized)),
            "temporal": tuple(v for k, v in self.TEMPORAL.items() if k in normalized),
        }
        ambiguity_constraints = tuple(
            {
                "surface": item.surface,
                "status": item.status,
                "chosen": item.chosen,
                "confidence": item.confidence,
                "candidates": tuple(
                    {
                        "sense": candidate.sense,
                        "quid": candidate.quid,
                        "score": candidate.score,
                        "cues": candidate.cues,
                    }
                    for candidate in item.candidates
                ),
            }
            for item in self._ambiguity_analysis.resolutions
        ) if self._ambiguity_analysis else ()

        constraints["embedding"] = tuple(embedding_records)
        constraints["coordination"] = tuple(coordination_records)
        constraints["relative"] = tuple(relative_records)
        constraints["ambiguity"] = ambiguity_constraints
        metaphor_resolution = self.metaphor.analyze(normalized)
        constraints["intent"] = {
            "primary": semantic_intent.primary.value,
            "confidence": semantic_intent.confidence,
            "secondary": tuple(intent.value for intent in semantic_intent.secondary),
            "speech_act": semantic_intent.speech_act,
            "target": semantic_intent.target,
            "signals": tuple(
                {
                    "pattern": signal.pattern,
                    "intent": signal.intent.value,
                    "weight": signal.weight,
                }
                for signal in semantic_intent.signals
            ),
        }
        constraints["metaphor"] = {
            "status": metaphor_resolution.status,
            "chosen": (
                {
                    "pattern": metaphor_resolution.chosen.surface_pattern,
                    "source_domain": metaphor_resolution.chosen.source_domain,
                    "target_domain": metaphor_resolution.chosen.target_domain,
                    "interpretation": metaphor_resolution.chosen.interpretation,
                    "confidence": metaphor_resolution.chosen.confidence,
                    "cues": metaphor_resolution.chosen.cues,
                }
                if metaphor_resolution.chosen
                else None
            ),
            "candidates": tuple(
                {
                    "pattern": candidate.surface_pattern,
                    "source_domain": candidate.source_domain,
                    "target_domain": candidate.target_domain,
                    "interpretation": candidate.interpretation,
                    "confidence": candidate.confidence,
                    "cues": candidate.cues,
                }
                for candidate in metaphor_resolution.candidates
            ),
        }
        constraints["coreference"] = tuple(
            {
                "anaphor": link.anaphor,
                "antecedent": link.antecedent,
                "confidence": link.confidence,
                "status": link.status,
                "strategy": link.strategy,
                "candidates": tuple(
                    {
                        "surface": candidate.surface,
                        "quid": candidate.quid,
                        "score": candidate.score,
                        "reason": candidate.reason,
                    }
                    for candidate in link.candidates
                ),
            }
            for link in coreference_links
        )
        constraints["polysemy"] = tuple(
            {
                "surface": family.surface,
                "senses": family.senses,
                "links": tuple(
                    {
                        "source": link.source_sense,
                        "target": link.target_sense,
                        "relation": link.relation,
                        "confidence": link.confidence,
                    }
                    for link in family.links
                ),
            }
            for family in (self._polysemy_analysis.families if self._polysemy_analysis else ())
        )
        constraints["language"] = self._language_constraints(
            replace(language_analysis, clauses=tuple(resolved_language_clauses))
        )
        constraints["lexical"] = tuple(
            {
                "surface": item.surface,
                "lemma": item.lemma,
                "relation": item.relation,
                "source": item.source,
                "confidence": item.confidence,
            }
            for item in SemanticLexicon.analyze(normalized)
        )
        grammar_analysis = self.grammar.analyze(text, language_analysis)
        constraints["grammar"] = grammar_analysis.to_dict()

        return MeaningRepresentation(
            text,
            frame,
            tuple(nodes.values()),
            tuple(self._dedupe(edges)),
            vector,
            constraints,
            provenance=("semantic-compiler",),
        )

    def _compile_relative_tree(
        self,
        clause,
        nodes: dict[str, MeaningNode],
        edges: list[MeaningEdge],
        ambiguity_map: Mapping[str, object],
        *,
        depth: int,
        path: tuple[int, ...],
        relativizers: tuple[str, ...],
        antecedent: str | None,
        records: list[dict[str, object]],
        embedding_records: list[dict[str, object]] | None = None,
        coordination_records: list[dict[str, object]] | None = None,
        relative_records: list[dict[str, object]] | None = None,
    ) -> None:
        """Ground a noun-attached relative clause into GIR."""
        relation = clause.relation
        subject = self.clean(clause.subject) if clause.subject else None
        object_ = self.clean(self._clean_object(clause.object)) if clause.object else None
        marker_path = ">".join(relativizers)
        suffix = "" if path == (0,) else "." + ".".join(str(item) for item in path)
        provenance = f"relative:{depth}:{marker_path}{suffix}"
        records.append(
            {
                "depth": depth,
                "path": ".".join(str(item) for item in path),
                "relativizers": relativizers,
                "relativizer": relativizers[-1] if relativizers else clause.relativizer,
                "antecedent": antecedent or clause.relative_antecedent,
                "relativizer_kind": clause.relativizer_kind,
                "relative_binding": clause.relative_binding,
                "relative_preposition": clause.relative_preposition,
                "subject": subject,
                "relation": relation,
                "object": object_,
                "negated": clause.negated,
            }
        )
        if subject and relation and object_ and not getattr(clause, "coreference_blocked", False):
            source = self._node(nodes, subject, "entity", 1, ambiguity_map)
            target = self._node(nodes, object_, "entity", 1, ambiguity_map)
            if relation in {
                "attacks", "eats", "sees", "uses", "builds", "creates", "gives",
                "helps", "hurts", "wants", "needs", "knows",
            }:
                scene = self._event(nodes, relation, subject, object_)
                edges.extend(
                    (
                        MeaningEdge(
                            scene.node_id, "has_agent", source.node_id, 9, 0.94,
                            clause.negated, clause.text, provenance,
                        ),
                        MeaningEdge(
                            scene.node_id, "has_patient", target.node_id, 4, 0.94,
                            clause.negated, clause.text, provenance,
                        ),
                    )
                )
            edges.append(
                MeaningEdge(
                    source.node_id,
                    relation,
                    target.node_id,
                    self.RELATION_FAMILY.get(relation, 2),
                    0.92,
                    clause.negated,
                    clause.text,
                    provenance,
                )
            )
            self._constraints(nodes, edges, source, clause.text)

        for index, child in enumerate(clause.embedded):
            self._compile_embedded_tree(
                child,
                nodes,
                edges,
                ambiguity_map,
                depth=depth + 1,
                path=(*path, index),
                subordinators=(*relativizers, clause.relativizer or "relative"),
                records=embedding_records if embedding_records is not None else [],
                coordination_records=coordination_records,
            )

        for index, sibling in enumerate(clause.coordinated):
            self._compile_coordinated_tree(
                sibling,
                nodes,
                edges,
                ambiguity_map,
                depth=depth + 1,
                path=(*path, index),
                coordinators=(*relativizers, clause.relativizer or "relative", clause.coordinator or "coord"),
                records=coordination_records if coordination_records is not None else [],
                embedding_records=embedding_records,
            )

        for index, relative in enumerate(clause.relative):
            self._compile_relative_tree(
                relative,
                nodes,
                edges,
                ambiguity_map,
                depth=depth + 1,
                path=(*path, index),
                relativizers=(*relativizers, clause.relativizer or "relative"),
                antecedent=clause.relative_antecedent,
                records=relative_records if relative_records is not None else records,
                embedding_records=embedding_records,
                coordination_records=coordination_records,
                relative_records=relative_records,
            )

    def _compile_embedded_tree(
        self,
        clause,
        nodes: dict[str, MeaningNode],
        edges: list[MeaningEdge],
        ambiguity_map: Mapping[str, object],
        *,
        depth: int,
        path: tuple[int, ...],
        subordinators: tuple[str, ...],
        records: list[dict[str, object]],
        coordination_records: list[dict[str, object]] | None = None,
    ) -> None:
        """Recursively ground a LanguageClause embedding tree into GIR."""
        relation = clause.relation
        subject = self.clean(clause.subject) if clause.subject else None
        object_ = (
            self.clean(self._clean_object(clause.object))
            if clause.object
            else None
        )
        records.append(
            {
                "depth": depth,
                "path": ".".join(str(item) for item in path),
                "subordinators": subordinators,
                "subordinator": clause.subordinator,
                "subject": subject,
                "relation": relation,
                "object": object_,
                "negated": clause.negated,
            }
        )

        if subject and relation and object_ and not getattr(clause, "coreference_blocked", False):
            source = self._node(nodes, subject, "entity", 1, ambiguity_map)
            target = self._node(nodes, object_, "entity", 1, ambiguity_map)
            provenance = f"embedded:{depth}:{'>'.join(subordinators)}"

            if relation in {
                "attacks", "eats", "sees", "uses", "builds",
                "creates", "gives", "helps", "hurts", "wants",
                "needs", "knows",
            }:
                scene = self._event(nodes, relation, subject, object_)
                edges.extend(
                    (
                        MeaningEdge(
                            scene.node_id,
                            "has_agent",
                            source.node_id,
                            9,
                            0.94,
                            clause.negated,
                            clause.text,
                            provenance,
                        ),
                        MeaningEdge(
                            scene.node_id,
                            "has_patient",
                            target.node_id,
                            4,
                            0.94,
                            clause.negated,
                            clause.text,
                            provenance,
                        ),
                    )
                )

            edges.append(
                MeaningEdge(
                    source.node_id,
                    relation,
                    target.node_id,
                    self.RELATION_FAMILY.get(relation, 2),
                    0.92,
                    clause.negated,
                    clause.text,
                    provenance,
                )
            )
            self._constraints(nodes, edges, source, clause.text)

        for index, child in enumerate(clause.embedded):
            next_subordinators = (
                *subordinators,
                clause.subordinator or "embedded",
            )
            self._compile_embedded_tree(
                child,
                nodes,
                edges,
                ambiguity_map,
                depth=depth + 1,
                path=(*path, index),
                subordinators=next_subordinators,
                records=records,
                coordination_records=coordination_records,
            )

        for index, sibling in enumerate(clause.coordinated):
            self._compile_coordinated_tree(
                sibling,
                nodes,
                edges,
                ambiguity_map,
                depth=depth + 1,
                path=(*path, index),
                coordinators=(*subordinators, *((clause.subordinator,) if clause.subordinator else ()), clause.coordinator or "coord"),
                records=coordination_records if coordination_records is not None else [],
                embedding_records=records,
            )

    def _compile_coordinated_tree(
        self,
        clause,
        nodes: dict[str, MeaningNode],
        edges: list[MeaningEdge],
        ambiguity_map: Mapping[str, object],
        *,
        depth: int,
        path: tuple[int, ...],
        coordinators: tuple[str, ...],
        records: list[dict[str, object]],
        embedding_records: list[dict[str, object]] | None = None,
    ) -> None:
        """Ground one coordinated sibling and recursively preserve its children."""
        relation = clause.relation
        subject = self.clean(clause.subject) if clause.subject else None
        object_ = self.clean(self._clean_object(clause.object)) if clause.object else None
        provenance = f"coordinated:{depth}:{'>'.join(coordinators)}"
        records.append({
            "depth": depth,
            "path": ".".join(str(item) for item in path),
            "coordinators": coordinators,
            "coordinator": coordinators[-1] if coordinators else clause.coordinator,
            "subject": subject,
            "relation": relation,
            "object": object_,
            "negated": clause.negated,
        })
        if subject and relation and object_ and not getattr(clause, "coreference_blocked", False):
            source = self._node(nodes, subject, "entity", 1, ambiguity_map)
            target = self._node(nodes, object_, "entity", 1, ambiguity_map)
            if relation in {
                "attacks", "eats", "sees", "uses", "builds", "creates", "gives",
                "helps", "hurts", "wants", "needs", "knows",
            }:
                scene = self._event(nodes, relation, subject, object_)
                edges.extend((
                    MeaningEdge(scene.node_id, "has_agent", source.node_id, 9, 0.94, clause.negated, clause.text, provenance),
                    MeaningEdge(scene.node_id, "has_patient", target.node_id, 4, 0.94, clause.negated, clause.text, provenance),
                ))
            edges.append(MeaningEdge(
                source.node_id, relation, target.node_id,
                self.RELATION_FAMILY.get(relation, 2), 0.92,
                clause.negated, clause.text, provenance,
            ))
            self._constraints(nodes, edges, source, clause.text)
        for index, child in enumerate(clause.embedded):
            child_records = []
            self._compile_embedded_tree(
                child, nodes, edges, ambiguity_map,
                depth=depth + 1,
                path=(*path, index),
                subordinators=(*coordinators, clause.subordinator or "embedded"),
                records=embedding_records if embedding_records is not None else child_records,
                coordination_records=records,
            )
        for index, sibling in enumerate(clause.coordinated):
            self._compile_coordinated_tree(
                sibling, nodes, edges, ambiguity_map,
                depth=depth + 1,
                path=(*path, index),
                coordinators=(*coordinators, clause.coordinator or "coord"),
                records=records,
                embedding_records=embedding_records,
            )

    @staticmethod
    def _language_constraints(analysis: LanguageAnalysis) -> Mapping[str, object]:
        def clause_to_dict(clause) -> dict[str, object]:
            return {
                "text": clause.text,
                "subject": clause.subject,
                "predicate": clause.predicate,
                "verb": clause.verb,
                "relation": clause.relation,
                "object": clause.object,
                "roles": tuple(
                    {
                        "role": role.role,
                        "text": role.text,
                        "confidence": role.confidence,
                    }
                    for role in clause.roles
                ),
                "negated": clause.negated,
                "tense": clause.tense,
                "aspect": clause.aspect,
                "modality": clause.modality,
                "temporal": clause.temporal,
                "quantifiers": tuple(
                    {
                        "surface": item.surface,
                        "kind": item.kind,
                        "scope": item.scope,
                        "confidence": item.confidence,
                    }
                    for item in clause.quantifiers
                ),
                "comparison": (
                    {
                        "subject": clause.comparison.subject,
                        "operator": clause.comparison.operator,
                        "reference": clause.comparison.reference,
                        "property_text": clause.comparison.property_text,
                        "confidence": clause.comparison.confidence,
                    }
                    if clause.comparison
                    else None
                ),
                "subordinator": clause.subordinator,
                "coordinator": clause.coordinator,
                "relativizer": clause.relativizer,
                "relative_antecedent": clause.relative_antecedent,
                "relativizer_kind": clause.relativizer_kind,
                "relative_binding": clause.relative_binding,
                "relative_preposition": clause.relative_preposition,
                "possessive_marker": clause.possessive_marker,
                "possessive_antecedent": clause.possessive_antecedent,
                "possessed": clause.possessed,
                "coreference_blocked": clause.coreference_blocked,
                "embedded": tuple(clause_to_dict(child) for child in clause.embedded),
                "coordinated": tuple(clause_to_dict(child) for child in clause.coordinated),
                "relative": tuple(clause_to_dict(child) for child in clause.relative),
            }

        return {
            "tokens": tuple(
                {
                    "text": token.text,
                    "lemma": token.lemma,
                    "position": token.position,
                    "pos": token.pos,
                    "tense": token.tense,
                    "aspect": token.aspect,
                    "person": token.person,
                    "number": token.number,
                    "gender": token.gender,
                }
                for token in analysis.tokens
            ),
            "clauses": tuple(
                clause_to_dict(clause)
                for clause in analysis.clauses
            ),
            "quantifiers": tuple(
                {
                    "surface": item.surface,
                    "kind": item.kind,
                    "scope": item.scope,
                    "confidence": item.confidence,
                }
                for item in analysis.quantifiers
            ),
            "comparisons": tuple(
                {
                    "subject": item.subject,
                    "operator": item.operator,
                    "reference": item.reference,
                    "property_text": item.property_text,
                    "confidence": item.confidence,
                }
                for item in analysis.comparisons
            ),
            "conditionals": tuple(
                {
                    "condition": item.condition,
                    "consequent": item.consequent,
                    "confidence": item.confidence,
                }
                for item in analysis.conditionals
            ),
            "markers": analysis.markers,
        }

    def _resolve_intrasentence_coreference(
        self,
        clause,
        mentions: list[Mention],
        links: list[CoreferenceLink],
    ):
        local_mentions = list(mentions)

        def is_pronoun(value) -> bool:
            return (
                isinstance(value, str)
                and value.casefold().strip() in self.coreference.PRONOUNS
            )

        def add_mentions(node) -> None:
            if node is None:
                return
            for surface, role in (
                (getattr(node, "subject", None), "subject"),
                (getattr(node, "object", None), "object"),
            ):
                if not surface or is_pronoun(surface):
                    continue
                gender, number = self.coreference.guess_agreement(surface)
                local_mentions.append(
                    Mention(
                        surface,
                        role,
                        len(local_mentions) + 1,
                        gender,
                        number,
                        None,
                    )
                )

        def resolve_argument(node, surface, role):
            if not is_pronoun(surface):
                return node, False
            link = self.coreference.resolve(
                surface,
                local_mentions,
                context_records=self.griot.context.records(),
            )
            links.append(link)
            if not link.resolved or not link.antecedent:
                return replace(node, coreference_blocked=True), True

            if role == "subject":
                replacement = self.language._roles(
                    link.antecedent,
                    node.object,
                    node.relation,
                    node.text,
                )
                return replace(
                    node,
                    subject=link.antecedent,
                    predicate=f"{node.relation}:{node.object or ''}",
                    roles=replacement,
                ), False

            replacement = self.language._roles(
                node.subject,
                link.antecedent,
                node.relation,
                node.text,
            )
            return replace(
                node,
                object=link.antecedent,
                predicate=f"{node.relation}:{link.antecedent}",
                roles=replacement,
            ), False

        def visit(child):
            child_out = child

            child_out, subject_blocked = resolve_argument(
                child_out,
                getattr(child_out, "subject", None),
                "subject",
            )
            if subject_blocked:
                return child_out, True

            add_mentions(child_out)

            child_out, object_blocked = resolve_argument(
                child_out,
                getattr(child_out, "object", None),
                "object",
            )
            if object_blocked:
                return child_out, True

            add_mentions(child_out)

            coordinated = tuple(visit(item)[0] for item in getattr(child_out, "coordinated", ()))
            embedded = tuple(visit(item)[0] for item in getattr(child_out, "embedded", ()))
            relatives = tuple(visit(item)[0] for item in getattr(child_out, "relative", ()))
            if coordinated or embedded or relatives:
                child_out = replace(
                    child_out,
                    coordinated=coordinated,
                    embedded=embedded,
                    relative=relatives,
                )
            return child_out, False

        resolved = clause
        resolved, subject_blocked = resolve_argument(
            resolved,
            getattr(resolved, "subject", None),
            "subject",
        )
        if subject_blocked:
            return resolved

        add_mentions(resolved)

        resolved, object_blocked = resolve_argument(
            resolved,
            getattr(resolved, "object", None),
            "object",
        )
        if object_blocked:
            return resolved

        add_mentions(resolved)

        coordinated = tuple(visit(item)[0] for item in getattr(resolved, "coordinated", ()))
        embedded = tuple(visit(item)[0] for item in getattr(resolved, "embedded", ()))
        relatives = tuple(visit(item)[0] for item in getattr(resolved, "relative", ()))
        return replace(
            resolved,
            coordinated=coordinated,
            embedded=embedded,
            relative=relatives,
        )

    def _parse(self, sentence: str) -> tuple[str, str, str] | None:
        modal = re.match(r"^(.*?)\s+(?:pode|deve|precisa)\s+(.+)$", sentence, re.I)
        candidate = f"{modal.group(1)} {modal.group(2)}" if modal else sentence
        for pattern, relation in self.STATEMENTS + self.VERBS:
            match = re.match(pattern, candidate, re.I)
            if match:
                return match.group(1), relation, match.group(2)

        # H9 lexical fallback: curated synonyms and their inflected forms must
        # reach the same canonical relation even when the legacy regex table
        # has no surface form for the verb.
        words = candidate.split()
        for index, word in enumerate(words):
            relation = SemanticLexicon.relation_for_verb(word.strip(" ,;:.!?"))
            if relation is None:
                continue
            subject_words = words[:index]
            while subject_words and subject_words[-1].casefold() in {
                "vai", "vão", "vao", "está", "esta", "estava",
            }:
                subject_words.pop()
            object_words = words[index + 1:]
            if subject_words and object_words:
                return " ".join(subject_words), relation, " ".join(object_words)
        return None

    @staticmethod
    def _clean_object(value: str) -> str:
        return re.sub(r"\s+(?:ontem|hoje|agora|amanhã)$", "", value.strip(), flags=re.I)

    def _node(
        self,
        nodes: dict[str, MeaningNode],
        surface: str,
        kind: str,
        family: int,
        ambiguity_map: Mapping[str, object] | None = None,
    ) -> MeaningNode:
        resolution = ambiguity_map.get(surface.casefold()) if ambiguity_map else None
        chosen_symbol = None
        if resolution is not None and getattr(resolution, "resolved", False):
            chosen_sense = getattr(resolution, "chosen", None)
            for candidate in getattr(resolution, "candidates", ()):
                if candidate.sense == chosen_sense:
                    chosen_symbol = candidate.quid
                    break
        elif resolution is not None:
            chosen_symbol = None

        if chosen_symbol is not None:
            q = self.griot.quids.get(chosen_symbol)
        elif resolution is not None:
            q = self.griot.quids.ensure(
                f"ambiguity:{surface.casefold()}:unresolved",
                base=BaseLayer.RICH,
                family_id=family,
            )
        else:
            q = self.griot.quids.get(surface)
            if q is None:
                q = self.griot.quids.ensure(
                    surface,
                    base=BaseLayer.RICH,
                    family_id=family,
                )
        node_id = f"q:{q.symbol}"
        if node_id not in nodes:
            nodes[node_id] = MeaningNode(node_id, q.symbol, surface, kind, q.family_id, 1.0)
        return nodes[node_id]

    def _event(self, nodes: dict[str, MeaningNode], relation: str, subject: str, object_: str) -> MeaningNode:
        label = f"event:{relation}:{subject}:{object_}"
        q = self.griot.quids.ensure(label, base=BaseLayer.SCENE, family_id=4)
        node = MeaningNode(f"s:{q.symbol}", q.symbol, relation, "event", 4, 0.95)
        nodes.setdefault(node.node_id, node)
        return nodes[node.node_id]

    def _constraints(self, nodes: dict[str, MeaningNode], edges: list[MeaningEdge], node: MeaningNode, sentence: str) -> None:
        for word, value in self.TEMPORAL.items():
            if word in sentence:
                q = self.griot.quids.ensure(value, base=BaseLayer.FOUNDATION, family_id=8)
                t = MeaningNode(f"t:{value}", q.symbol, value, "temporal", 8, 0.9)
                nodes.setdefault(t.node_id, t)
                edges.append(MeaningEdge(node.node_id, "temporal", t.node_id, 8, 0.85, evidence=sentence))
        for modal in self.MODAL_ACTIONS:
            if re.search(rf"\b{modal}\b", sentence):
                q = self.griot.quids.ensure(modal, base=BaseLayer.FOUNDATION, family_id=7)
                m = MeaningNode(f"m:{modal}", q.symbol, modal, "modality", 7, 0.9)
                nodes.setdefault(m.node_id, m)
                edges.append(MeaningEdge(node.node_id, "modal", m.node_id, 7, 0.86, evidence=sentence))
        number = re.search(r"-?\d+(?:[\.,]\d+)?", sentence)
        if number:
            raw = number.group(0).replace(",", ".")
            q = self.griot.quids.ensure(f"number:{raw}", base=BaseLayer.RICH, family_id=3)
            n = MeaningNode(f"n:{raw}", q.symbol, raw, "numeric", 3, 0.99)
            nodes.setdefault(n.node_id, n)
            edges.append(MeaningEdge(node.node_id, "has_value", n.node_id, 3, 0.98, evidence=sentence))

    def _compose_vector(self, nodes: Mapping[str, MeaningNode], edges: Iterable[MeaningEdge]) -> tuple[float, ...]:
        vectors: list[tuple[tuple[float, ...], float]] = []
        for node in nodes.values():
            q = self.griot.quids.get(node.quid)
            if q:
                vectors.append((q.signature, node.confidence))
        kernel = self.griot.kernel if hasattr(self.griot, "kernel") else self.griot.numeric
        for edge in edges:
            vectors.append((kernel.signature(edge.relation, edge.family_id, BaseLayer.PRIMITIVE.value), edge.confidence * 0.7))
        return kernel.weighted_sum(vectors)

    @staticmethod
    def _dedupe(edges: Iterable[MeaningEdge]) -> list[MeaningEdge]:
        # Preserve distinct embedded occurrences when provenance identifies
        # different clause paths, while retaining the historical collapse for
        # duplicate top-level edges with no provenance.
        seen: set[tuple[str, str, str, bool, str | None]] = set()
        out: list[MeaningEdge] = []
        for edge in edges:
            key = (
                edge.source,
                edge.relation,
                edge.target,
                edge.negated,
                edge.provenance if edge.provenance is not None else None,
            )
            if key not in seen:
                seen.add(key)
                out.append(edge)
        return out


class SemanticGRIOT:
    def __init__(self, griot: GRIOT | None = None) -> None:
        self.engine = griot or (GRIOT.create() if hasattr(GRIOT, "create") else GRIOT())
        self.compiler = MeaningCompiler(self.engine)

    def understand(self, text: str) -> MeaningRepresentation:
        return self.compiler.compile(text)

    def learn(self, text: str, source: str = "text") -> int:
        meaning = self.understand(text)
        added = 0
        for fact in meaning.facts():
            self.engine.graph.add_fact(
                Fact(
                    fact.subject,
                    fact.relation,
                    fact.object,
                    fact.confidence,
                    fact.negated,
                    source,
                    fact.evidence,
                )
            )
            added += 1
        return added

    def meaning_similarity(self, a: str, b: str) -> float:
        va, vb = self.understand(a).vector, self.understand(b).vector
        kernel = self.engine.kernel if hasattr(self.engine, "kernel") else self.engine.numeric
        return kernel.cosine(va, vb) if va and vb else 0.0


__all__ = [
    "GIR",
    "MeaningEdge",
    "MeaningNode",
    "MeaningRepresentation",
    "MeaningCompiler",
    "SemanticGRIOT",
    "AmbiguityAnalysis",
    "AmbiguityResolver",
    "PolysemyAnalysis",
    "PolysemyResolver",
    "CoreferenceLink",
    "CoreferenceResolver",
    "Mention",
    "SemanticIntent",
    "SemanticIntentDetector",
    "LanguageAnalysis",
    "LanguageIntelligence",
]