from __future__ import annotations

from dataclasses import dataclass, replace
import re
import unicodedata
from typing import Iterable

from griot_lexical_semantics import SemanticLexicon


@dataclass(frozen=True, slots=True)
class LanguageToken:
    text: str
    lemma: str
    position: int
    pos: str
    tense: str | None = None
    aspect: str | None = None
    person: int | None = None
    number: str | None = None
    gender: str | None = None


@dataclass(frozen=True, slots=True)
class SemanticRole:
    role: str
    text: str
    confidence: float


@dataclass(frozen=True, slots=True)
class Quantifier:
    surface: str
    kind: str
    scope: str
    confidence: float


@dataclass(frozen=True, slots=True)
class Comparison:
    subject: str
    operator: str
    reference: str
    property_text: str
    confidence: float


@dataclass(frozen=True, slots=True)
class Conditional:
    condition: str
    consequent: str
    confidence: float


@dataclass(frozen=True, slots=True)
class LanguageClause:
    text: str
    subject: str | None
    predicate: str | None
    verb: str | None
    relation: str | None
    object: str | None
    roles: tuple[SemanticRole, ...]
    negated: bool
    tense: str | None
    aspect: str | None
    modality: str | None
    temporal: tuple[str, ...]
    quantifiers: tuple[Quantifier, ...]
    comparison: Comparison | None
    subordinator: str | None = None
    embedded: tuple["LanguageClause", ...] = ()
    coordinated: tuple["LanguageClause", ...] = ()
    coordinator: str | None = None
    relative: tuple["LanguageClause", ...] = ()
    relativizer: str | None = None
    relative_antecedent: str | None = None
    relativizer_kind: str | None = None
    relative_binding: str | None = None
    relative_preposition: str | None = None
    possessive_marker: str | None = None
    possessive_antecedent: str | None = None
    possessed: str | None = None
    coreference_blocked: bool = False
    clitic_marker: str | None = None
    clitic_role: str | None = None


@dataclass(frozen=True, slots=True)
class LanguageAnalysis:
    text: str
    tokens: tuple[LanguageToken, ...]
    clauses: tuple[LanguageClause, ...]
    quantifiers: tuple[Quantifier, ...]
    comparisons: tuple[Comparison, ...]
    conditionals: tuple[Conditional, ...]
    markers: tuple[str, ...]


class LanguageIntelligence:
    """Deterministic language-understanding front-end for GRIOT.

    This is deliberately model-free: morphology and shallow syntax are made
    explicit so the semantic compiler can consume structured linguistic facts
    instead of relying only on relation regexes.
    """

    PRONOUNS = {
        "eu": ("1", "sing"), "tu": ("2", "sing"), "ele": ("3", "sing"),
        "ela": ("3", "sing"), "eles": ("3", "plur"), "elas": ("3", "plur"),
        "nós": ("1", "plur"), "nos": ("1", "plur"), "vós": ("2", "plur"),
        "vocês": ("3", "plur"), "voce": ("3", "sing"), "você": ("3", "sing"),
        "isto": ("3", "sing"), "isso": ("3", "sing"), "aquilo": ("3", "sing"),
    }

    DETERMINERS = frozenset({
        "o", "a", "os", "as", "um", "uma", "uns", "umas", "este", "esta",
        "estes", "estas", "esse", "essa", "esses", "essas", "aquele",
        "aquela", "aqueles", "aquelas", "meu", "minha", "meus", "minhas",
        "seu", "sua", "seus", "suas",
    })

    PREPOSITIONS = frozenset({
        "a", "ao", "aos", "à", "às", "de", "do", "da", "dos", "das", "em",
        "no", "na", "nos", "nas", "por", "para", "com", "sem", "sobre",
        "entre", "contra", "desde", "até", "perante", "sob",
    })

    CONJUNCTIONS = frozenset({
        "e", "ou", "nem", "mas", "porém", "porem", "contudo", "entretanto",
        "porque", "pois", "se", "embora", "quando", "enquanto", "portanto",
        "logo", "assim", "que",
    })

    NEGATIONS = frozenset({"não", "nao", "nunca", "jamais", "nem"})

    RELATIVE_MARKERS = (
        "o qual", "a qual", "os quais", "as quais",
        "no qual", "na qual", "nos quais", "nas quais", "ao qual", "à qual",
        "em que", "a que", "de que", "do qual", "da qual",
        "dos quais", "das quais", "a quem", "de quem", "em quem",
        "cujo", "cuja", "cujos", "cujas", "quem", "onde", "que",
    )

    QUANTIFIER_KINDS = {
        "todo": "universal",
        "toda": "universal",
        "todos": "universal",
        "todas": "universal",
        "nenhum": "negative_universal",
        "nenhuma": "negative_universal",
        "algum": "existential",
        "alguma": "existential",
        "alguns": "existential_plural",
        "algumas": "existential_plural",
        "vários": "existential_plural",
        "varios": "existential_plural",
        "várias": "existential_plural",
        "varias": "existential_plural",
        "cada": "distributive",
        "ambos": "dual",
        "ambas": "dual",
        "um": "indefinite",
        "uma": "indefinite",
    }

    MODALS = {
        "pode": "possibility",
        "podem": "possibility",
        "poder": "possibility",
        "poderia": "possibility",
        "deve": "necessity",
        "devem": "necessity",
        "dever": "necessity",
        "deveria": "necessity",
        "precisa": "necessity",
        "precisam": "necessity",
        "precisar": "necessity",
        "talvez": "uncertainty",
        "provavelmente": "probability",
        "certamente": "certainty",
    }

    TEMPORAL = {
        "ontem": "past",
        "hoje": "present",
        "agora": "present",
        "amanhã": "future",
        "amanha": "future",
        "antes": "relative_before",
        "depois": "relative_after",
        "enquanto": "overlap",
    }

    RELATION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
        (re.compile(r"^(.+?)\s+faz parte (?:de|do|da|dos|das)\s+(.+)$", re.I), "part_of"),
        (re.compile(r"^(.+?)\s+pertence a\s+(.+)$", re.I), "member_of"),
        (re.compile(r"^(.+?)\s+é um\s+(.+)$", re.I), "is_a"),
        (re.compile(r"^(.+?)\s+é uma\s+(.+)$", re.I), "is_a"),
        (re.compile(r"^(.+?)\s+(?:tem|possui)\s+(.+)$", re.I), "has"),
        (re.compile(r"^(.+?)\s+(?:causa|provoca)\s+(.+)$", re.I), "causes"),
        (re.compile(r"^(.+?)\s+antes de\s+(.+)$", re.I), "before"),
        (re.compile(r"^(.+?)\s+depois de\s+(.+)$", re.I), "after"),
        (re.compile(r"^(.+?)\s+(?:está|esta|fica|vive)\s+(?:em|no|na|nos|nas)\s+(.+)$", re.I), "located_in"),
    ) + SemanticLexicon.relation_patterns()

    VERB_LEMMAS = {
        "ataca": "atacar", "atacou": "atacar", "atacar": "atacar", "atacam": "atacar", "ruge": "rugir", "rugiu": "rugir", "rugir": "rugir", "rugem": "rugir", "habita": "habitar", "habitou": "habitar", "habitar": "habitar", "habitam": "habitar", "vive": "viver", "viveu": "viver", "viver": "viver", "vivem": "viver",
        "come": "comer", "comeu": "comer", "comer": "comer", "comem": "comer",
        "vê": "ver", "ve": "ver", "viu": "ver", "ver": "ver", "veem": "ver",
        "usa": "usar", "usou": "usar", "usar": "usar", "usam": "usar",
        "constrói": "construir", "constroi": "construir", "construiu": "construir",
        "construir": "construir", "constroem": "construir",
        "cria": "criar", "criou": "criar", "criar": "criar", "criam": "criar",
        "ajuda": "ajudar", "ajudou": "ajudar", "ajudar": "ajudar", "ajudam": "ajudar",
        "fere": "ferir", "feriu": "ferir", "ferir": "ferir", "ferem": "ferir",
        "quer": "querer", "queria": "querer", "querer": "querer", "querem": "querer",
        "precisa": "precisar", "precisou": "precisar", "precisar": "precisar", "precisam": "precisar",
        "sabe": "saber", "soube": "saber", "saber": "saber", "sabem": "saber",
        "faz": "fazer", "fez": "fazer", "fazer": "fazer", "fazem": "fazer",
        "deu": "dar", "dar": "dar", "dá": "dar", "dao": "dar", "dão": "dar",
        "é": "ser", "era": "ser", "foi": "ser", "ser": "ser", "são": "ser", "sao": "ser",
        "está": "estar", "esta": "estar", "estava": "estar", "estavam": "estar", "estar": "estar",
        "fica": "ficar", "ficou": "ficar", "ficar": "ficar",
        "tem": "ter", "tinha": "ter", "teve": "ter", "ter": "ter", "têm": "ter", "temos": "ter",
        "vai": "ir", "vão": "ir", "vao": "ir", "ia": "ir", "foi": "ir", "ir": "ir",
        "pode": "poder", "podem": "poder", "poder": "poder",
        "deve": "dever", "devem": "dever", "dever": "dever",
        "há": "haver", "ha": "haver", "havia": "haver", "haver": "haver",
    }

    AUXILIARIES = frozenset({
        "ser", "estar", "ter", "haver", "ir", "poder", "dever", "precisar",
        "é", "era", "foi", "está", "esta", "estava", "tem", "tinha", "teve",
        "vai", "vão", "vao", "pode", "podem", "deve", "devem",
    })
    AUXILIARY_HELPERS = frozenset({
        "ser", "estar", "ter", "haver", "ir",
    })

    @staticmethod
    def normalize_token(token: str) -> str:
        return unicodedata.normalize("NFKC", token).casefold()

    def tokenize(self, text: str) -> tuple[LanguageToken, ...]:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        pieces = re.findall(r"[\wÀ-ÿ]+(?:['’-][\wÀ-ÿ]+)?|\d+(?:[\.,]\d+)?|[^\w\s]", text, re.UNICODE)
        return tuple(
            LanguageToken(
                piece,
                self._lemma(piece),
                index,
                self._pos(piece),
                *self._morphology(piece),
            )
            for index, piece in enumerate(pieces)
        )

    def analyze(self, text: str) -> LanguageAnalysis:
        if not isinstance(text, str):
            raise TypeError("text must be a string")
        if not text.strip():
            raise ValueError("text must not be empty")

        tokens = self.tokenize(text)
        clauses_text = self._split_clauses(text)
        clauses = tuple(
            self._parse_clause(value)
            for value in clauses_text
            if value.strip()
        )
        quantifiers = self._all_quantifiers(text)
        comparisons = tuple(
            clause.comparison for clause in clauses if clause.comparison is not None
        )
        conditionals = self._conditionals(text)
        markers = tuple(
            token for token in self.TEMPORAL if re.search(rf"(?<!\w){re.escape(token)}(?!\w)", text.casefold())
        )
        return LanguageAnalysis(
            text=text,
            tokens=tokens,
            clauses=clauses,
            quantifiers=quantifiers,
            comparisons=comparisons,
            conditionals=conditionals,
            markers=markers,
        )

    def _split_clauses(self, text: str) -> tuple[str, ...]:
        normalized = re.sub(r"\s+", " ", text.strip())
        if not normalized:
            return ()
        fronted_marker = "\\ue000"
        fronted_prefix = re.match(r"^([^,;]+),\s*(.+)$", normalized)
        if fronted_prefix:
            prefix, remainder = fronted_prefix.groups()
            # A leading non-verbal constituent followed by a verbal clause is
            # treated as a fronted adjunct/argument, not as two clauses. Keep
            # the comma as a marker so the structural parser can still recover
            # the argument boundary after clause splitting.
            prefix_probe = prefix.strip(" ,;:.!?")
            remainder_probe = remainder.strip(" ,;:.!?")
            if (
                self._main_verb_index(prefix_probe) is None
                and self._main_verb_index(remainder_probe) is not None
            ):
                normalized = f"{prefix_probe}{fronted_marker}{remainder_probe}"

        chunks = re.split(
            r"(?<=[;])\s*",
            normalized,
            flags=re.I,
        )
        return tuple(
            chunk.replace(fronted_marker, ", ").strip(" ,;")
            for chunk in chunks
            if chunk.replace(fronted_marker, ", ").strip(" ,;")
        )

    def _parse_clause(self, clause: str) -> LanguageClause:
        clitic = self._detect_clitic_form(clause)
        if clitic is not None:
            expanded, marker = clitic
            parsed = self._parse_clause(expanded)
            if parsed.relation is not None:
                return replace(
                    parsed,
                    text=clause,
                    object=marker,
                    predicate=f"{parsed.relation}:{marker}",
                    clitic_marker=marker,
                    clitic_role="object",
                )

        lower = clause.casefold()
        multiple_relative_parts = self._split_multiple_relatives(clause)
        if multiple_relative_parts is not None:
            main_text, relatives_data, antecedent = multiple_relative_parts
            main_clause = self._parse_clause(main_text)
            if main_clause.relation is not None:
                bound_relatives = []
                for marker, relative_text in relatives_data:
                    relative_clause = self._bind_relative_clause(
                        relative_text,
                        antecedent,
                        marker,
                    )
                    if relative_clause.relation is None:
                        continue
                    bound_relatives.append(
                        replace(
                            relative_clause,
                            relativizer=marker,
                            relativizer_kind=self._relative_kind(marker),
                            relative_antecedent=antecedent,
                        )
                    )
                return replace(
                    main_clause,
                    text=clause,
                    relative=tuple(bound_relatives),
                    relativizer=relatives_data[0][0],
                    relative_antecedent=antecedent,
                )


        nested_relative_parts = self._split_nested_subject_relative_clause(clause)
        if nested_relative_parts is not None:
            main_text, marker, relative_text, antecedent = nested_relative_parts
            main_clause = self._parse_clause(main_text)
            if main_clause.relation is not None and main_clause.subject == antecedent:
                relative_clause = self._bind_relative_clause(
                    relative_text,
                    antecedent,
                    marker,
                )
                return replace(
                    main_clause,
                    text=clause,
                    relative=(relative_clause,) if relative_clause.relation is not None else (),
                    relativizer=marker,
                    relative_antecedent=antecedent,
                )
        possessive_parts = self._split_possessive_relative(clause)
        if possessive_parts is not None:
            main_text, marker, relative_text, antecedent, possessed = possessive_parts
            main_clause = self._parse_clause(main_text)
            if main_clause.relation is not None and main_clause.subject == antecedent:
                relative_clause = self._parse_clause(relative_text)
                if (
                    relative_clause.relation is not None
                    and relative_clause.object is None
                    and self._strip_det(relative_clause.subject or "") != possessed
                ):
                    relative_roles = self._roles(
                        relative_clause.subject,
                        possessed,
                        relative_clause.relation,
                        relative_clause.text,
                    )
                    relative_clause = replace(
                        relative_clause,
                        object=possessed,
                        predicate=f"{relative_clause.relation}:{possessed}",
                        roles=relative_roles,
                        relative_antecedent=possessed,
                        relative_binding="object",
                    )
                return replace(
                    main_clause,
                    text=clause,
                    relative=(relative_clause,) if relative_clause.relation is not None else (),
                    relativizer=marker,
                    relative_antecedent=antecedent,
                    relativizer_kind="possessive",
                    relative_binding="possessor",
                    possessive_marker=marker,
                    possessive_antecedent=antecedent,
                    possessed=possessed,
                )

        relative_parts = self._split_relative_clause(clause)
        if relative_parts is None:
            relative_parts = self._split_subject_relative_clause(clause)
        if relative_parts is not None:
            main_text, relativizer, relative_text, antecedent = relative_parts
            main_clause = self._parse_clause(main_text)
            if (
                main_clause.relation is not None
                and (
                    main_clause.object == antecedent
                    or main_clause.subject == antecedent
                )
            ):
                relative_clause = self._bind_relative_clause(relative_text, antecedent, relativizer)
                if relative_clause.relation is not None:
                    return replace(
                        main_clause,
                        text=clause,
                        relative=(relative_clause,),
                        relativizer=relativizer,
                        relative_antecedent=antecedent,
                        relativizer_kind=self._relative_kind(relativizer),
                        relative_binding=relative_clause.relative_binding,
                        relative_preposition=self._relative_preposition(relativizer),
                    )
                # The relative structure is still recognized even when its
                # predicate is unsupported. Preserve the main proposition and
                # abstain from inventing a relative relation.
                return replace(
                    main_clause,
                    text=clause,
                    relative=(),
                    relativizer=relativizer,
                    relative_antecedent=antecedent,
                    relativizer_kind=self._relative_kind(relativizer),
                    relative_binding=relative_clause.relative_binding,
                    relative_preposition=self._relative_preposition(relativizer),
                )

        main_text, subordinator, subordinate_text = self._split_embedded_clause(clause)
        if subordinate_text is not None:
            main_clause = self._parse_clause(main_text)
            if main_clause.relation is not None:
                embedded_clause = self._parse_clause(subordinate_text)
                if main_clause.coordinator and main_clause.coordinated:
                    # A trailing subordinate marker after coordination binds
                    # deterministically to the final conjunct in this shallow
                    # grammar, preserving branch-local scope.
                    siblings = list(main_clause.coordinated)
                    siblings[-1] = replace(
                        siblings[-1],
                        subordinator=subordinator,
                        embedded=(embedded_clause,),
                    )
                    return replace(
                        main_clause,
                        text=clause,
                        coordinated=tuple(siblings),
                    )
                return replace(
                    main_clause,
                    text=clause,
                    subordinator=subordinator,
                    embedded=(embedded_clause,),
                )
        # H16: resolve coordination after an explicit subordinate split so
        # mixed structures retain their natural hierarchy:
        #   A porque B e C  -> A -> (B e C)
        #   A e B porque C  -> (A e B) -> C
        coordination = re.search(
            r"^(.+?)\s+(e|ou|nem|mas|porém|porem|contudo|entretanto|portanto|logo)\s+(.+)$",
            clause.strip(),
            flags=re.I,
        )
        if coordination:
            left, connector, right = coordination.groups()
            if (
                self._main_verb_index(left.strip()) is not None
                and self._main_verb_index(right.strip()) is not None
            ):
                left_clause = self._parse_clause(left.strip())
                right_clause = self._parse_clause(right.strip())
                if left_clause.relation is not None:
                    return replace(
                        left_clause,
                        text=clause.strip(),
                        coordinator=self.normalize_token(connector),
                        coordinated=(right_clause,),
                    )

        structural = self._parse_structural_clause(clause)
        if structural is not None:
            return structural

        # Fronted temporal adjuncts belong to the clause semantically, but
        # must not become part of the grammatical subject/predicate span.
        parse_clause = re.sub(
            r"^(?:ontem|hoje|agora|amanhã|amanha|antes|depois)\s*,?\s*",
            "",
            clause.strip(),
            flags=re.I,
        )
        negated = bool(re.search(r"(?<!\w)(?:não|nao|nunca|jamais)(?!\w)", lower))
        modality = self._find_modality(lower)
        temporal = tuple(value for word, value in self.TEMPORAL.items() if re.search(rf"(?<!\w){re.escape(word)}(?!\w)", lower))
        quantifiers = self._quantifiers(clause)

        for pattern, relation in self.RELATION_PATTERNS:
            match = pattern.match(parse_clause.strip())
            if match:
                subject = self._strip_det(
                    re.sub(
                        r"\b(?:não|nao|nunca|jamais|nem)\b",
                        "",
                        match.group(1),
                        flags=re.I,
                    ).strip()
                )
                object_ = self._strip_det(match.group(2))
                return LanguageClause(
                    clause,
                    subject,
                    f"{relation}:{match.group(2)}",
                    self._find_main_verb(parse_clause),
                    relation,
                    object_,
                    self._roles(subject, match.group(2), relation, clause),
                    negated,
                    self._clause_tense(clause),
                    self._clause_aspect(clause),
                    modality,
                    temporal,
                    quantifiers,
                    self._comparison(clause),
                )

        verb_index = self._main_verb_index(parse_clause)
        if verb_index is None:
            return LanguageClause(
                clause, None, None, None, None, None, (),
                negated, None, None, modality, temporal, quantifiers, self._comparison(clause),
            )

        words = parse_clause.split()
        verb_word = words[verb_index]
        subject_text = " ".join(words[:verb_index]).strip()
        subject_text = re.sub(r"\b(?:não|nao|nunca|jamais)\b", "", subject_text, flags=re.I)
        subject_words = subject_text.split()
        while subject_words and self._lemma(subject_words[-1]) in self.AUXILIARIES:
            subject_words.pop()
        subject = self._strip_det(" ".join(subject_words).strip()) or None
        tail = " ".join(words[verb_index + 1:]).strip()
        lemma = self._lemma(verb_word)
        relation = self._relation_for_verb(parse_clause, lemma)
        object_, recipient = self._extract_complements(tail, relation)
        relative_clause = None
        relativizer = None
        relative_antecedent = None
        if object_:
            relative_parts = self._split_relative_argument(object_)
            if relative_parts is not None:
                base_object, relativizer, relative_text = relative_parts
                relative_clause = self._bind_relative_clause(
                    relative_text,
                    base_object,
                )
                if relative_clause.relation is not None:
                    object_ = base_object
                    relative_antecedent = base_object
                else:
                    relative_clause = None
                    relativizer = None

        roles = self._roles(subject, object_, relation, clause)
        if recipient:
            roles = self._dedupe_roles(
                (*roles, SemanticRole("recipient", recipient, 0.90))
            )
        result = LanguageClause(
            clause,
            subject,
            tail or None,
            verb_word,
            relation,
            object_ or None,
            roles,
            negated,
            self._clause_tense(clause),
            self._clause_aspect(clause),
            modality,
            temporal,
            quantifiers,
            self._comparison(clause),
        )
        if relative_clause is not None:
            result = replace(
                result,
                relative=(relative_clause,),
                relativizer=relativizer,
                relative_antecedent=relative_antecedent,
                relativizer_kind=self._relative_kind(relativizer),
                relative_binding=relative_clause.relative_binding,
                relative_preposition=self._relative_preposition(relativizer),
            )
        return result

    def _split_nested_subject_relative_clause(
        self,
        clause: str,
    ) -> tuple[str, str, str, str] | None:
        text = re.sub(r"\s+", " ", clause.strip()).strip(" .;!?")
        marker_pattern = r"(" + "|".join(re.escape(x) for x in self.RELATIVE_MARKERS) + r")"
        first = re.match(
            r"^(.+?)\s+" + marker_pattern + r"\s+(.+)$",
            text,
            flags=re.I,
        )
        if not first:
            return None

        prefix, marker, remainder = first.groups()
        if self._main_verb_index(prefix.strip()) is not None:
            return None
        antecedent = self._strip_det(prefix.strip())
        if not antecedent:
            return None

        nested = re.search(
            r"\s+" + marker_pattern + r"\s+",
            remainder,
            flags=re.I,
        )
        if not nested:
            return None

        outer_relative_prefix = remainder[:nested.start()].strip()
        nested_marker = self.normalize_token(nested.group(1))
        nested_tail = remainder[nested.end():].strip()
        if self._main_verb_index(outer_relative_prefix) is None:
            return None

        tail_words = nested_tail.split()
        for split in range(1, len(tail_words)):
            nested_relative_text = " ".join(tail_words[:split]).strip(" ,.;:!?")
            main_tail = " ".join(tail_words[split:]).strip(" ,.;:!?")
            if not nested_relative_text or not main_tail:
                continue

            nested_candidate = (
                self._build_possessive_modifier(
                    antecedent=antecedent,
                    marker=nested_marker,
                    relative_text=nested_relative_text,
                )
                if nested_marker.startswith("cujo")
                else self._bind_relative_clause(
                    nested_relative_text,
                    antecedent,
                    nested_marker,
                )
            )
            if (
                nested_candidate is None
                or nested_candidate.relation is None
                or nested_candidate.subject is None
                or nested_candidate.object is None
                or self.normalize_token(nested_candidate.object) in self.DETERMINERS
            ):
                continue

            main_candidate = self._parse_clause(
                f"{antecedent} {main_tail}"
            )
            if (
                main_candidate.relation is None
                or main_candidate.subject != antecedent
            ):
                continue

            relative_text = (
                f"{outer_relative_prefix} {nested_marker} "
                f"{nested_relative_text}"
            ).strip()
            return (
                f"{antecedent} {main_tail}",
                self.normalize_token(marker),
                relative_text,
                antecedent,
            )
        return None

    def _detect_clitic_form(
        self,
        clause: str,
    ) -> tuple[str, str] | None:
        pattern = re.compile(
            r"\b([\wÀ-ÿ]+)-((?:lo|la|los|las|lhe|lhes|o|a|os|as))\b",
            re.I,
        )
        match = pattern.search(clause)
        if not match:
            return None

        verb, marker = match.groups()
        if self._pos(verb) not in {"VERB", "AUX"}:
            return None

        expanded = (
            f"{clause[:match.start()]}{verb} {marker}{clause[match.end():]}"
        )
        return re.sub(r"\s+", " ", expanded).strip(), self.normalize_token(marker)

    def _split_multiple_relatives(
        self,
        clause: str,
    ) -> tuple[str, tuple[tuple[str, str], ...], str] | None:
        text = re.sub(r"\s+", " ", clause.strip()).strip(" .;!?")
        marker_pattern = r"(que|o qual|a qual|os quais|as quais)"
        first = re.match(
            r"^(.+?)\s+" + marker_pattern + r"\s+(.+)$",
            text,
            flags=re.I,
        )
        if not first:
            return None

        prefix, marker, remainder = first.groups()
        prefix = prefix.strip()
        marker = self.normalize_token(marker)

        split_marker = re.search(
            r"\s+e\s+(" + marker_pattern + r")\s+",
            remainder,
            flags=re.I,
        )
        if not split_marker:
            return None

        first_relative = remainder[:split_marker.start()].strip()
        marker2 = self.normalize_token(split_marker.group(1))
        if marker2 != marker:
            return None
        tail = remainder[split_marker.end():].strip()

        # Object-attached: the main clause precedes both relatives.
        object_main = self._parse_clause(prefix)
        if object_main.relation is not None and object_main.object:
            first_clause = self._parse_clause(first_relative)
            second_clause = self._parse_clause(tail)
            if first_clause.relation is not None or second_clause.relation is not None:
                return (
                    prefix,
                    (
                        (marker, first_relative),
                        (marker2, tail),
                    ),
                    self._strip_det(object_main.object),
                )

        # Subject-attached: the main clause follows both relatives.
        if self._main_verb_index(prefix) is None:
            antecedent = self._strip_det(prefix)
            if not antecedent:
                return None

            first_clause = self._parse_clause(first_relative)
            tail_words = tail.split()
            second_verb = self._main_verb_index(tail)
            if second_verb is None:
                return None

            for main_split in range(second_verb + 1, len(tail_words)):
                relative2_text = " ".join(tail_words[:main_split]).strip()
                main_tail = " ".join(tail_words[main_split:]).strip()
                if not self._main_verb_index(main_tail):
                    # A verb at position zero is valid; only reject a missing verb.
                    if self._main_verb_index(main_tail) is None:
                        continue
                main_candidate = self._parse_clause(f"{antecedent} {main_tail}")
                if (
                    main_candidate.relation is not None
                    and main_candidate.subject == antecedent
                ):
                    if first_clause.relation is None and self._main_verb_index(first_relative) is None:
                        return None
                    return (
                        f"{antecedent} {main_tail}",
                        (
                            (marker, first_relative),
                            (marker2, relative2_text),
                        ),
                        antecedent,
                    )
        return None

    def _split_possessive_relative(
        self,
        clause: str,
    ) -> tuple[str, str, str, str, str] | None:
        text = re.sub(r"\s+", " ", clause.strip()).strip(" .;!?")
        markers = ("cujo", "cuja", "cujos", "cujas")
        match = re.search(
            r"^(.+?)\s+(" + "|".join(markers) + r")\s+(.+)$",
            text,
            flags=re.I,
        )
        if not match:
            return None

        prefix, marker, remainder = match.groups()
        if self._main_verb_index(prefix.strip()) is not None:
            return None
        antecedent = self._strip_det(prefix.strip())
        if not antecedent:
            return None

        words = remainder.split()
        first_verb = self._main_verb_index(remainder)
        if first_verb is None:
            return None

        preverb = words[:first_verb]
        subject_start = None
        for index in range(len(preverb) - 1, 0, -1):
            token = self.normalize_token(preverb[index])
            if token in self.DETERMINERS:
                subject_start = index
                break

        if subject_start is not None:
            possessed_tokens = preverb[:subject_start]
            relative_subject_prefix = preverb[subject_start:]
        else:
            possessed_tokens = preverb
            relative_subject_prefix = preverb

        possessed = self._strip_det(" ".join(possessed_tokens))
        if not possessed:
            return None

        for split in range(first_verb + 1, len(words)):
            relative_body = words[first_verb:split]
            relative_text = " ".join(
                [*relative_subject_prefix, *relative_body]
            ).strip(" ,.;:!?")
            main_tail = " ".join(words[split:]).strip(" ,.;:!?")
            if not relative_text or not main_tail:
                continue
            if self._main_verb_index(main_tail) is None:
                continue

            relative_clause = self._parse_clause(relative_text)
            if (
                relative_clause.relation is not None
                and relative_clause.object is None
                and self._strip_det(relative_clause.subject or "") != possessed
            ):
                relative_roles = self._roles(
                    relative_clause.subject,
                    possessed,
                    relative_clause.relation,
                    relative_clause.text,
                )
                relative_clause = replace(
                    relative_clause,
                    object=possessed,
                    predicate=f"{relative_clause.relation}:{possessed}",
                    roles=relative_roles,
                    relative_antecedent=possessed,
                    relative_binding="object",
                )
            main_candidate = self._parse_clause(f"{antecedent} {main_tail}")
            if main_candidate.relation is None or main_candidate.subject != antecedent:
                continue

            return (
                f"{antecedent} {main_tail}",
                self.normalize_token(marker),
                relative_text,
                antecedent,
                possessed,
            )
        return None

    def _split_subject_relative_clause(
        self,
        clause: str,
    ) -> tuple[str, str, str, str] | None:
        text = re.sub(r"\s+", " ", clause.strip()).strip(" .;!?")
        marker_pattern = r"(" + "|".join(re.escape(x) for x in self.RELATIVE_MARKERS) + r")"
        match = re.search(
            r"^(.+?)\s+" + marker_pattern + r"\s+(.+)$",
            text,
            flags=re.I,
        )
        if not match:
            return None

        prefix, marker, remainder = match.groups()
        if self._main_verb_index(prefix.strip()) is not None:
            return None

        antecedent = self._strip_det(prefix.strip())
        if not antecedent:
            return None

        words = remainder.strip().split()
        first_verb = self._main_verb_index(remainder.strip())
        if first_verb is None or first_verb >= len(words) - 1:
            return None

        # The first predicate belongs to the relative clause. Find the
        # earliest later boundary where the remaining text is a valid main
        # predicate for the same antecedent. The relative predicate itself may
        # be unknown; H18 must preserve the main clause and abstain semantically.
        for split in range(first_verb + 1, len(words)):
            relative_text = " ".join(words[:split]).strip(" ,.;:!?")
            main_tail = " ".join(words[split:]).strip(" ,.;:!?")
            if not relative_text or not main_tail:
                continue
            if self._main_verb_index(main_tail) is None:
                continue
            relative_clause = self._parse_clause(relative_text)
            main_candidate = self._parse_clause(
                f"{antecedent} {main_tail}"
            )
            if (
                main_candidate.relation is None
                or main_candidate.subject != antecedent
            ):
                continue
            return (
                f"{antecedent} {main_tail}",
                self.normalize_token(marker),
                relative_text,
                antecedent,
            )
        return None

    def _split_relative_clause(
        self,
        clause: str,
    ) -> tuple[str, str, str, str] | None:
        text = re.sub(r"\s+", " ", clause.strip())
        marker_pattern = r"(" + "|".join(re.escape(x) for x in self.RELATIVE_MARKERS) + r")"
        match = re.search(
            r"^(.+?)\s+" + marker_pattern + r"\s+(.+)$",
            text,
            flags=re.I,
        )
        if not match:
            return None
        main_text, marker, relative_text = match.groups()
        parsed_main = self._parse_clause(main_text)
        if (
            parsed_main.relation is None
            or parsed_main.object is None
            or self._main_verb_index(relative_text.strip()) is None
        ):
            return None
        antecedent = self._strip_det(parsed_main.object.strip())
        if not antecedent:
            return None
        return main_text.strip(), self.normalize_token(marker), relative_text.strip(), antecedent

    def _split_relative_argument(
        self,
        argument: str,
    ) -> tuple[str, str, str] | None:
        markers = self.RELATIVE_MARKERS
        pattern = re.compile(
            r"^(.+?)\s+(" + "|".join(re.escape(x) for x in markers) + r")\s+(.+)$",
            re.I,
        )
        match = pattern.match(argument.strip())
        if not match:
            return None
        antecedent, marker, relative_text = match.groups()
        if self._main_verb_index(relative_text.strip()) is None:
            return None
        antecedent = self._strip_det(antecedent.strip())
        if not antecedent:
            return None
        return antecedent, self.normalize_token(marker), relative_text.strip()

    @staticmethod
    def _relative_preposition(relativizer: str | None) -> str | None:
        if not relativizer:
            return None
        normalized = relativizer.casefold()
        if normalized in {"em que", "no qual", "na qual", "nos quais", "nas quais", "em quem"}:
            return "em"
        if normalized in {"a quem", "a que", "ao qual", "à qual"}:
            return "a"
        if normalized in {"de que", "do qual", "da qual", "dos quais", "das quais", "de quem"}:
            return "de"
        return None

    @staticmethod
    def _relative_kind(relativizer: str | None) -> str | None:
        if not relativizer:
            return None
        normalized = relativizer.casefold()
        if normalized in {"onde", "em que", "no qual", "na qual", "nos quais", "nas quais"}:
            return "locative"
        if normalized in {"quem", "a quem", "de quem", "em quem"}:
            return "personal"
        if normalized in {
            "o qual", "a qual", "os quais", "as quais",
            "cujo", "cuja", "cujos", "cujas", "onde", "que",
        }:
            return "nominal"
        if normalized.split(" ", 1)[0] in {"a", "ao", "à", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas"}:
            return "prepositional"
        if normalized.startswith("cujo"):
            return "possessive"
        return "nominal"

    def _bind_relative_clause(
        self,
        relative_text: str,
        antecedent: str,
        relativizer: str | None = None,
    ) -> "LanguageClause":
        # H23: before parsing a relative as a flat clause, look for another
        # relative marker attached to its object. This preserves structures
        # such as "que viu o lobo que atacou a floresta".
        nested = self._split_nested_relative_argument(relative_text)
        if nested is not None:
            main_text, nested_marker, nested_text, nested_antecedent = nested
            outer = self._parse_clause(
                f"{antecedent} {main_text}"
            )
            if (
                outer.relation is not None
                and outer.subject == antecedent
                and outer.object == nested_antecedent
            ):
                if nested_marker.startswith("cujo"):
                    nested_clause = self._build_possessive_modifier(
                        nested_antecedent,
                        nested_marker,
                        nested_text,
                    )
                    if nested_clause is not None:
                        nested_clause = replace(
                            nested_clause,
                            relativizer=nested_marker,
                            relativizer_kind="possessive",
                            relative_antecedent=nested_antecedent,
                            relative_binding="possessor",
                            possessive_marker=nested_marker,
                            possessive_antecedent=nested_antecedent,
                            possessed=nested_clause.possessed or nested_clause.subject,
                        )
                else:
                    nested_clause = self._bind_relative_clause(
                        nested_text,
                        nested_antecedent,
                        nested_marker,
                    )
                if nested_clause is not None and nested_clause.relation is not None:
                    return replace(
                        outer,
                        relative=(nested_clause,),
                        relativizer=relativizer,
                        relativizer_kind=self._relative_kind(relativizer),
                        relative_antecedent=antecedent,
                        relative_binding="subject",
                        relative_preposition=self._relative_preposition(relativizer),
                    )

        parsed = self._parse_clause(relative_text)
        if parsed.relation is None:
            return replace(
                parsed,
                relative_antecedent=antecedent,
                relativizer=relativizer,
                relativizer_kind=self._relative_kind(relativizer),
                relative_binding="unknown",
                relative_preposition=self._relative_preposition(relativizer),
            )
        subject = parsed.subject
        object_ = parsed.object
        binding: str | None = None
        if subject is None and object_:
            subject = antecedent
            binding = "subject"
        elif object_ is None and subject:
            object_ = antecedent
            binding = "object"
        else:
            return replace(
                parsed,
                relative_antecedent=antecedent,
                relativizer_kind=self._relative_kind(relativizer),
                relative_binding="explicit",
                relative_preposition=self._relative_preposition(relativizer),
            )
        roles = self._roles(subject, object_, parsed.relation, parsed.text)
        return replace(
            parsed,
            subject=subject,
            object=object_,
            predicate=f"{parsed.relation}:{object_ or ''}",
            roles=roles,
            relative_antecedent=antecedent,
            relativizer_kind=self._relative_kind(relativizer),
            relative_binding=binding,
            relative_preposition=self._relative_preposition(relativizer),
        )

    def _split_nested_relative_argument(
        self,
        relative_text: str,
    ) -> tuple[str, str, str, str] | None:
        text = re.sub(r"\s+", " ", relative_text.strip()).strip(" .;!?")
        marker_pattern = r"(" + "|".join(re.escape(x) for x in self.RELATIVE_MARKERS) + r")"
        match = re.search(
            r"\s+" + marker_pattern + r"\s+",
            text,
            flags=re.I,
        )
        if not match:
            return None

        main_text = text[:match.start()].strip(" ,.;:!?")
        marker = self.normalize_token(match.group(1))
        nested_text = text[match.end():].strip(" ,.;:!?")
        if not main_text or not nested_text:
            return None

        if self._main_verb_index(main_text) is None:
            return None
        outer_probe = self._parse_clause("__ANTE__ " + main_text)
        if outer_probe.relation is None or not outer_probe.object:
            return None

        antecedent = self._strip_det(outer_probe.object)
        if not antecedent:
            return None

        direct_candidate = (
            self._build_possessive_modifier(
                antecedent,
                marker,
                nested_text,
            )
            if marker.startswith("cujo")
            else self._bind_relative_clause(
                nested_text,
                antecedent,
                marker,
            )
        )
        if (
            direct_candidate is not None
            and direct_candidate.relation is not None
            and direct_candidate.subject is not None
            and direct_candidate.object is not None
            and self.normalize_token(direct_candidate.object) not in self.DETERMINERS
        ):
            return main_text, marker, nested_text, antecedent

        words = nested_text.split()
        for split in range(1, len(words)):
            nested_relative_text = " ".join(words[:split]).strip(" ,.;:!?")
            main_tail = " ".join(words[split:]).strip(" ,.;:!?")
            if not nested_relative_text or not main_tail:
                continue

            nested_candidate = (
                self._build_possessive_modifier(
                    antecedent,
                    marker,
                    nested_relative_text,
                )
                if marker.startswith("cujo")
                else self._bind_relative_clause(
                    nested_relative_text,
                    antecedent,
                    marker,
                )
            )
            if (
                nested_candidate is None
                or nested_candidate.relation is None
                or nested_candidate.subject is None
                or nested_candidate.object is None
                or self.normalize_token(nested_candidate.object) in self.DETERMINERS
            ):
                continue

            outer_candidate = self._parse_clause(
                f"__ANTE__ {main_text} {main_tail}"
            )
            if (
                outer_candidate.relation is None
                or outer_candidate.subject != "__ANTE__"
            ):
                continue

            return main_text, marker, nested_relative_text, antecedent

        # Unknown nested predicates are left for the normal H17/H18 parser,
        # which preserves the outer proposition without inventing semantics.
        return None

    def _build_possessive_modifier(
        self,
        antecedent: str,
        marker: str,
        relative_text: str,
    ) -> "LanguageClause | None":
        parsed = self._parse_clause(relative_text)
        if (
            parsed.relation is None
            or parsed.subject is None
            or parsed.object is None
            or self.normalize_token(parsed.object) in self.DETERMINERS
        ):
            return None
        possessed = parsed.subject
        return replace(
            parsed,
            relative_antecedent=antecedent,
            relativizer=marker,
            relativizer_kind="possessive",
            relative_binding="possessor",
            possessive_marker=marker,
            possessive_antecedent=antecedent,
            possessed=possessed,
        )

    def _split_embedded_clause(
        self,
        clause: str,
    ) -> tuple[str, str | None, str | None]:
        text = clause.strip()
        # Split only on subordinators with a non-empty proposition on both
        # sides. The split is deterministic and preserves the main clause as
        # the canonical top-level proposition.
        pattern = re.compile(
            r"^(.+?)\s+(porque|pois|já que|ja que|quando|enquanto|se|embora|que)\s+(.+)$",
            re.I,
        )
        match = pattern.match(text)
        if not match:
            return text, None, None

        main_text, subordinator, subordinate_text = match.groups()
        # "se" and "que" are only treated as subordinators when the right side
        # contains a recognizable predicate; this avoids stealing ordinary
        # lexical material from the object span.
        if self._main_verb_index(main_text.strip()) is None:
            return text, None, None
        if self._main_verb_index(subordinate_text.strip()) is None:
            return text, None, None
        return main_text.strip(), self.normalize_token(subordinator), subordinate_text.strip()

    def _parse_structural_clause(self, clause: str) -> LanguageClause | None:
        working = re.sub(
            r"^(?:ontem|hoje|agora|amanhã|amanha|antes|depois)\s*,\s*",
            "",
            clause.strip(),
            flags=re.I,
        )

        # Argument-order normalization: a topicalized direct/governed
        # complement remains the semantic object of the following predicate.
        fronted = re.match(r"^(.+?),\s+(.+)$", working, flags=re.I)
        if fronted:
            fronted_argument = fronted.group(1).strip()
            remainder = fronted.group(2).strip()
            temporal_marker = self.normalize_token(
                fronted_argument.strip(" ,;:.!?")
            )
            if temporal_marker not in self.TEMPORAL:
                parsed_remainder = self._parse_clause(remainder)

                # Dative/recipient fronting is distinct from object fronting:
                # preserve the direct object from the remainder and attach the
                # topicalized constituent as a recipient role.
                if (
                    parsed_remainder.subject
                    and parsed_remainder.relation == "gives"
                    and parsed_remainder.object
                    and re.match(
                        r"^(?:a|ao|à|aos|às|para)\s+.+$",
                        fronted_argument,
                        flags=re.I,
                    )
                ):
                    recipient = self._strip_argument_marker(fronted_argument)
                    if recipient:
                        roles = self._dedupe_roles(
                            (
                                *parsed_remainder.roles,
                                SemanticRole("recipient", recipient, 0.90),
                            )
                        )
                        return LanguageClause(
                            clause,
                            parsed_remainder.subject,
                            f"gives:{parsed_remainder.object}",
                            parsed_remainder.verb,
                            "gives",
                            parsed_remainder.object,
                            roles,
                            parsed_remainder.negated,
                            parsed_remainder.tense,
                            parsed_remainder.aspect,
                            parsed_remainder.modality,
                            parsed_remainder.temporal,
                            parsed_remainder.quantifiers,
                            parsed_remainder.comparison,
                        )

                if (
                    parsed_remainder.subject
                    and parsed_remainder.relation
                    and parsed_remainder.object is None
                    and parsed_remainder.relation in {
                        "attacks", "eats", "sees", "uses", "builds",
                        "creates", "gives", "helps", "hurts", "wants",
                        "needs", "knows",
                    }
                ):
                    argument = self._strip_argument_marker(fronted_argument)
                    if argument:
                        return LanguageClause(
                            clause,
                            parsed_remainder.subject,
                            f"{parsed_remainder.relation}:{argument}",
                            parsed_remainder.verb,
                            parsed_remainder.relation,
                            argument,
                            self._roles(
                                parsed_remainder.subject,
                                argument,
                                parsed_remainder.relation,
                                clause,
                            ),
                            parsed_remainder.negated,
                            parsed_remainder.tense,
                            parsed_remainder.aspect,
                            parsed_remainder.modality,
                            parsed_remainder.temporal,
                            parsed_remainder.quantifiers,
                            parsed_remainder.comparison,
                        )

        # Passive voice: surface patient becomes semantic object and the
        # "por/pelo/pela/..." complement becomes semantic agent.
        passive = re.match(
            r"^(.+?)\s+(?:é|foi|era|erá|está|estava|são|foram|eram|será)\s+([^\s]+)\s+(?:por|pelo|pela|pelos|pelas)\s+(.+)$",
            working,
            flags=re.I,
        )
        if passive:
            patient = self._strip_det(passive.group(1).strip())
            participle = passive.group(2).strip(" ,;:.!?")
            agent = self._strip_det(passive.group(3).strip())
            relation = SemanticLexicon.passive_relation(participle)
            if relation and patient and agent:
                return LanguageClause(
                    clause,
                    agent,
                    f"{relation}:{patient}",
                    participle,
                    relation,
                    patient,
                    (
                        SemanticRole("agent", agent, 0.93),
                        SemanticRole("patient", patient, 0.94),
                    ),
                    bool(re.search(r"\b(?:não|nao|nunca|jamais)\b", clause, re.I)),
                    self._clause_tense(clause),
                    self._clause_aspect(clause),
                    self._find_modality(clause.casefold()),
                    tuple(value for word, value in self.TEMPORAL.items() if re.search(rf"(?<!\w){re.escape(word)}(?!\w)", clause.casefold())),
                    self._quantifiers(clause),
                    self._comparison(clause),
                )

        # Nominalized relation: "o ataque do lobo ao cão" and
        # "a construção da casa pelo arquiteto".
        nominal = re.match(
            r"^(?:o|a|os|as)\s+([^\s]+)\s+(?:de|do|da|dos|das)\s+(.+?)\s+(?:a|ao|à|aos|às)\s+(.+)$",
            working,
            flags=re.I,
        )
        if nominal:
            relation = SemanticLexicon.nominalization_relation(nominal.group(1))
            if relation:
                agent = self._strip_det(nominal.group(2).strip())
                patient = self._strip_det(nominal.group(3).strip())
                if agent and patient:
                    return LanguageClause(
                        clause,
                        agent,
                        f"{relation}:{patient}",
                        nominal.group(1),
                        relation,
                        patient,
                        (
                            SemanticRole("agent", agent, 0.90),
                            SemanticRole("patient", patient, 0.90),
                        ),
                        False,
                        None,
                        None,
                        None,
                        (),
                        self._quantifiers(clause),
                        self._comparison(clause),
                    )

        nominal_by = re.match(
            r"^(?:o|a|os|as)\s+([^\s]+)\s+(?:de|do|da|dos|das)\s+(.+?)\s+(?:por|pelo|pela|pelos|pelas)\s+(.+)$",
            working,
            flags=re.I,
        )
        if nominal_by:
            relation = SemanticLexicon.nominalization_relation(nominal_by.group(1))
            if relation:
                patient = self._strip_det(nominal_by.group(2).strip())
                agent = self._strip_det(nominal_by.group(3).strip())
                if patient and agent:
                    return LanguageClause(
                        clause,
                        agent,
                        f"{relation}:{patient}",
                        nominal_by.group(1),
                        relation,
                        patient,
                        (
                            SemanticRole("agent", agent, 0.90),
                            SemanticRole("patient", patient, 0.90),
                        ),
                        False,
                        None,
                        None,
                        None,
                        (),
                        self._quantifiers(clause),
                        self._comparison(clause),
                    )

        return None

    @staticmethod
    def _strip_argument_marker(value: str) -> str:
        value = re.sub(
            r"^(?:a|ao|à|aos|às|de|do|da|dos|das|em|no|na|nos|nas|para|por|pelo|pela|pelos|pelas)\s+",
            "",
            value.strip(),
            flags=re.I,
        )
        return LanguageIntelligence._strip_det(value)

    def _roles(self, subject: str | None, object_: str | None, relation: str | None, clause: str) -> tuple[SemanticRole, ...]:
        roles: list[SemanticRole] = []
        if subject:
            roles.append(SemanticRole("agent", self._strip_det(subject), 0.88))
        if relation in {"wants", "needs", "knows"} and subject:
            roles[0] = SemanticRole("experiencer", self._strip_det(subject), 0.92)
        if object_:
            roles.append(SemanticRole("patient", self._strip_det(object_), 0.86))
        match = re.search(r"\b(?:em|no|na|nos|nas)\s+([^,;]+)", clause, flags=re.I)
        if match:
            roles.append(SemanticRole("location", self._strip_det(match.group(1)), 0.84))
        instrument = re.search(r"\bcom\s+([^,;]+)", clause, flags=re.I)
        if instrument and not re.search(r"\bcom\s+(?:ele|ela|eles|elas|me|te|nos|vos)\b", instrument.group(0), re.I):
            roles.append(SemanticRole("instrument", self._strip_det(instrument.group(1)), 0.72))
        recipient = re.search(r"\bpara\s+([^,;]+)", clause, flags=re.I)
        if recipient:
            roles.append(SemanticRole("recipient", self._strip_det(recipient.group(1)), 0.76))
        for word in self.TEMPORAL:
            if re.search(rf"(?<!\w){re.escape(word)}(?!\w)", clause.casefold()):
                roles.append(SemanticRole("temporal", word, 0.90))
        return self._dedupe_roles(roles)

    def _main_verb_index(self, clause: str) -> int | None:
        words = clause.split()
        predicate_indexes = [
            index for index, word in enumerate(words)
            if self._pos(word) in {"VERB", "AUX"}
        ]
        if not predicate_indexes:
            return None
        lexical = [
            index for index in predicate_indexes
            if self._lemma(words[index]) not in self.AUXILIARY_HELPERS
        ]
        return lexical[0] if lexical else predicate_indexes[0]

    def _find_main_verb(self, clause: str) -> str | None:
        index = self._main_verb_index(clause)
        return clause.split()[index] if index is not None else None

    def _relation_for_verb(self, clause: str, lemma: str) -> str | None:
        explicit = {
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
        }
        if lemma == "ir":
            # Near-future periphrases ("vai/vão + infinitive") carry the
            # semantic relation of the lexical infinitive, not of "ir".
            match = re.search(r"\b(?:vai|vao|vão)\s+([^\s,;:.!?]+)", clause, flags=re.I)
            if match:
                future_lemma = self._lemma(match.group(1))
                if future_lemma in explicit:
                    return explicit[future_lemma]
        lexical_relation = SemanticLexicon.relation_for_verb(lemma)
        if lexical_relation is not None:
            return lexical_relation
        if lemma in explicit:
            return explicit[lemma]

        # Defensive fallback: a clause can contain an auxiliary/periphrastic
        # verb sequence whose lexical head was not selected by the shallow
        # predicate detector. Recover the first explicit lexical relation.
        for word in clause.split():
            candidate = self._lemma(word.strip(" ,;:.!?"))
            if candidate in self.AUXILIARY_HELPERS:
                continue
            lexical_relation = SemanticLexicon.relation_for_verb(candidate)
            if lexical_relation is not None:
                return lexical_relation
            if candidate in explicit:
                return explicit[candidate]
        if re.search(r"\b(?:causa|causou|provoca|provocou)\b", clause, re.I):
            return "causes"
        return None

    def _extract_complements(
        self,
        tail: str,
        relation: str | None,
    ) -> tuple[str, str | None]:
        if not tail:
            return "", None

        if relation == "gives":
            # Direct object + recipient: "deu o osso ao cão".
            direct_then_recipient = re.match(
                r"^(.+?)\s+(?:a|ao|à|aos|às|para)\s+(.+)$",
                tail,
                flags=re.I,
            )
            if direct_then_recipient:
                object_ = self._strip_det(direct_then_recipient.group(1))
                recipient = self._strip_argument_marker(
                    direct_then_recipient.group(2)
                )
                return object_, recipient or None

            # Recipient + direct object: "deu ao cão o osso".
            recipient_then_direct = re.match(
                r"^(?:a|ao|à|aos|às|para)\s+(.+?)\s+"
                r"((?:o|a|os|as|um|uma|uns|umas)\s+.+)$",
                tail,
                flags=re.I,
            )
            if recipient_then_direct:
                recipient = self._strip_argument_marker(
                    recipient_then_direct.group(1)
                )
                object_ = self._strip_det(recipient_then_direct.group(2))
                return object_, recipient or None

        if relation in {"needs", "located_in"}:
            normalized_tail = tail.strip(" ,;:.!?")
            object_ = self._strip_argument_marker(normalized_tail)
            return object_, None

        return self._extract_object(tail), None

    def _extract_object(self, tail: str) -> str:
        if not tail:
            return ""
        tail = re.sub(r"^(?:não|nao|nunca|jamais)\s+", "", tail, flags=re.I)
        tail = re.split(r"\s+(?:e|ou|mas|porque|se)\s+", tail, maxsplit=1, flags=re.I)[0]
        tail = re.sub(r"\s+(?:ontem|hoje|agora|amanhã|amanha)$", "", tail, flags=re.I)
        return self._strip_det(tail.strip(" ,;:"))

    def _clause_tense(self, clause: str) -> str | None:
        words = [self.normalize_token(w) for w in re.findall(r"[\wÀ-ÿ]+", clause)]
        # Portuguese near-future periphrasis has a dedicated precedence rule:
        # present-tense "ir" + infinitive must win over suffix heuristics.
        for i, word in enumerate(words[:-1]):
            if word in {"vai", "vao", "vão"} and self._morphology(words[i + 1])[0] == "infinitive":
                return "near_future"
        for i, word in enumerate(words):
            if self._pos(word) not in {"VERB", "AUX"}:
                continue
            lemma = self._lemma(word)
            tense, _, _, _ = self._morphology(word)
            if lemma in {"ser", "estar", "ter", "ir", "poder", "dever"}:
                if tense:
                    return self._periphrastic_tense(words, i, tense)
            if tense:
                return tense
        return None

    def _periphrastic_tense(self, words: list[str], index: int, tense: str) -> str:
        if tense in {"present"} and index + 1 < len(words):
            next_word = words[index + 1]
            next_tense, _, _, _ = self._morphology(next_word)
            if self._lemma(words[index]) == "ir" and next_tense == "infinitive":
                return "near_future"
        if tense in {"past_perfect", "past_imperfect"} and index + 1 < len(words):
            next_word = words[index + 1]
            next_tense, _, _, _ = self._morphology(next_word)
            if self._lemma(words[index]) == "estar" and next_tense == "gerund":
                return tense
        return tense

    def _clause_aspect(self, clause: str) -> str | None:
        words = [self.normalize_token(w) for w in re.findall(r"[\wÀ-ÿ]+", clause)]
        for index, word in enumerate(words[:-1]):
            lemma = self._lemma(word)
            next_tense, _, _, _ = self._morphology(words[index + 1])
            if lemma == "estar" and next_tense == "gerund":
                return "progressive"
            if lemma in {"ter", "haver"} and next_tense == "participle":
                return "perfect"
        return None

    def _morphology(self, word: str) -> tuple[str | None, str | None, int | None, str | None]:
        key = self.normalize_token(word)
        irregular = {
            "sou": ("present", 1, "sing"), "és": ("present", 2, "sing"), "e": ("present", 3, "sing"),
            "é": ("present", 3, "sing"), "somos": ("present", 1, "plur"), "são": ("present", 3, "plur"),
            "era": ("past_imperfect", 3, "sing"), "eram": ("past_imperfect", 3, "plur"),
            "foi": ("past_perfect", 3, "sing"), "foram": ("past_perfect", 3, "plur"),
            "está": ("present", 3, "sing"), "estava": ("past_imperfect", 3, "sing"), "estavam": ("past_imperfect", 3, "plur"),
            "tem": ("present", 3, "sing"), "têm": ("present", 3, "plur"), "tinha": ("past_imperfect", 3, "sing"),
            "teve": ("past_perfect", 3, "sing"), "tinham": ("past_imperfect", 3, "plur"),
            "vai": ("present", 3, "sing"), "vão": ("present", 3, "plur"), "ia": ("past_imperfect", 3, "sing"),
            "pode": ("present", 3, "sing"), "podem": ("present", 3, "plur"), "poderia": ("conditional", 3, "sing"),
            "deve": ("present", 3, "sing"), "devem": ("present", 3, "plur"), "deveria": ("conditional", 3, "sing"),
            "quer": ("present", 3, "sing"), "queria": ("past_imperfect", 3, "sing"),
            "soube": ("past_perfect", 3, "sing"), "sabe": ("present", 3, "sing"),
            "deu": ("past_perfect", 3, "sing"), "dá": ("present", 3, "sing"), "dão": ("present", 3, "plur"),
        }
        if key in irregular:
            tense, person, number = irregular[key]
            return tense, None, person, number
        if re.fullmatch(r"[^\W\d_]+(?:ando|endo|indo)", key, re.UNICODE):
            return "gerund", "progressive", None, None
        if re.fullmatch(r"[^\W\d_]+(?:ado|ido)", key, re.UNICODE):
            return "participle", "perfect", None, None
        if re.fullmatch(r"[^\W\d_]+(?:ar|er|ir)", key, re.UNICODE):
            return "infinitive", None, None, None

        endings: tuple[tuple[str, str, int | None, str | None], ...] = (
            ("arão", "future", 3, "plur"), ("erão", "future", 3, "plur"), ("irão", "future", 3, "plur"),
            ("ará", "future", 3, "sing"), ("erá", "future", 3, "sing"), ("irá", "future", 3, "sing"),
            ("aremos", "future", 1, "plur"), ("eremos", "future", 1, "plur"), ("iremos", "future", 1, "plur"),
            ("aria", "conditional", 3, "sing"), ("eria", "conditional", 3, "sing"), ("iria", "conditional", 3, "sing"),
            ("ariam", "conditional", 3, "plur"), ("eriam", "conditional", 3, "plur"), ("iriam", "conditional", 3, "plur"),
            ("ávamos", "past_imperfect", 1, "plur"), ("íamos", "past_imperfect", 1, "plur"), ("ávamos", "past_imperfect", 1, "plur"),
            ("ava", "past_imperfect", 3, "sing"), ("ia", "past_imperfect", 3, "sing"),
            ("avam", "past_imperfect", 3, "plur"), ("iam", "past_imperfect", 3, "plur"),
            ("ávamos", "past_imperfect", 1, "plur"), ("íamos", "past_imperfect", 1, "plur"),
            ("aram", "past_perfect", 3, "plur"), ("aste", "past_perfect", 2, "sing"),
            ("iste", "past_perfect", 2, "sing"), ("imos", "past_perfect", 1, "plur"),
            ("ou", "past_perfect", 3, "sing"), ("eu", "past_perfect", 1, "sing"),
            ("iu", "past_perfect", 3, "sing"), ("amos", "present", 1, "plur"),
            ("ais", "present", 2, "plur"), ("am", "present", 3, "plur"),
            ("as", "present", 2, "sing"), ("es", "present", 2, "sing"),
            ("is", "present", 2, "sing"), ("em", "present", 3, "plur"), ("a", "present", 3, "sing"),
            ("e", "present", 3, "sing"), ("o", "present", 1, "sing"),
        )
        for ending, tense, person, number in endings:
            # Present-tense endings are highly ambiguous with ordinary nouns
            # (e.g. "casa" ends in -a). Only trust them for known verb forms.
            if tense == "present" and key not in self.VERB_LEMMAS:
                continue
            if key.endswith(ending) and len(key) > len(ending) + 1:
                return tense, None, person, number
        return None, None, None, None

    def _lemma(self, word: str) -> str:
        key = self.normalize_token(word)
        lexical = SemanticLexicon.resolve_verb(key)
        if lexical is not None:
            return lexical.lemma
        if key in self.VERB_LEMMAS:
            return self.VERB_LEMMAS[key]
        if key.endswith("ando") and len(key) > 5:
            return f"{key[:-4]}ar"
        if key.endswith("endo") and len(key) > 5:
            return f"{key[:-4]}er"
        if key.endswith("indo") and len(key) > 5:
            return f"{key[:-4]}ir"
        if key.endswith("ado") and len(key) > 4:
            return f"{key[:-3]}ar"
        if key.endswith("ido") and len(key) > 4:
            return f"{key[:-3]}ir"
        return key

    def _pos(self, word: str) -> str:
        key = self.normalize_token(word)
        if re.fullmatch(r"\d+(?:[\.,]\d+)?", key):
            return "NUM"
        if (
            isinstance(word, str)
            and word[:1].isupper()
            and key not in self.VERB_LEMMAS
            and key not in self.MODALS
        ):
            return "WORD"
        if key in self.NEGATIONS:
            return "NEG"
        if key in self.MODALS:
            return "AUX"
        if key in self.PRONOUNS:
            return "PRON"
        if key in self.DETERMINERS:
            return "DET"
        if key in self.PREPOSITIONS:
            return "PREP"
        if key in self.CONJUNCTIONS:
            return "CONJ"
        if key in self.VERB_LEMMAS or self._morphology(key)[0] is not None:
            return "VERB"
        if SemanticLexicon.resolve_verb(key) is not None:
            return "VERB"
        if key in self.TEMPORAL:
            return "ADV"
        if re.fullmatch(r"[A-Za-zÀ-ÿ]+", key):
            return "WORD"
        return "PUNCT"

    def _find_modality(self, text: str) -> str | None:
        for word, value in sorted(self.MODALS.items(), key=lambda item: -len(item[0])):
            if re.search(rf"(?<!\w){re.escape(word)}(?!\w)", text):
                return value
        return None

    def _quantifiers(self, text: str) -> tuple[Quantifier, ...]:
        words = text.split()
        result: list[Quantifier] = []
        for index, word in enumerate(words):
            key = self.normalize_token(word.strip(" ,.;:!?"))
            kind = self.QUANTIFIER_KINDS.get(key)
            if kind is None:
                continue
            scope_words: list[str] = []
            for candidate in words[index + 1:]:
                clean = candidate.strip(" ,.;:!?")
                if clean.casefold() in self.CONJUNCTIONS or clean.casefold() in self.PREPOSITIONS:
                    break
                scope_words.append(clean)
                if len(scope_words) >= 4:
                    break
            scope = " ".join(scope_words)
            result.append(Quantifier(key, kind, scope, 0.90))
        return self._dedupe_quantifiers(result)

    def _all_quantifiers(self, text: str) -> tuple[Quantifier, ...]:
        return self._quantifiers(text)

    def _comparison(self, text: str) -> Comparison | None:
        patterns = (
            (r"(.+?)\s+(?:é|são)\s+mais\s+(.+?)\s+do\s+que\s+(.+)$", "greater_than"),
            (r"(.+?)\s+(?:é|são)\s+menos\s+(.+?)\s+do\s+que\s+(.+)$", "less_than"),
            (r"(.+?)\s+(?:é|são)\s+tão\s+(.+?)\s+quanto\s+(.+)$", "equal_degree"),
        )
        for pattern, operator in patterns:
            match = re.match(pattern, text.strip(), re.I)
            if match:
                return Comparison(
                    self._strip_det(match.group(1)),
                    operator,
                    self._strip_det(match.group(3)),
                    match.group(2).strip(),
                    0.88,
                )
        return None

    def _conditionals(self, text: str) -> tuple[Conditional, ...]:
        match = re.match(r"\s*se\s+(.+?)(?:,|\s+então\s+)\s*(.+)$", text.strip(), flags=re.I)
        if not match:
            return ()
        return (Conditional(match.group(1).strip(), match.group(2).strip(), 0.88),)

    @staticmethod
    def _strip_det(value: str) -> str:
        value = value.strip()
        return re.sub(
            r"^(?:o|a|os|as|um|uma|uns|umas|este|esta|esse|essa|aquele|aquela)\s+",
            "",
            value,
            flags=re.I,
        ).strip(" ,.;:!?")

    @staticmethod
    def _dedupe_roles(values: Iterable[SemanticRole]) -> tuple[SemanticRole, ...]:
        seen: set[tuple[str, str]] = set()
        out: list[SemanticRole] = []
        for value in values:
            key = (value.role, value.text.casefold())
            if key not in seen:
                seen.add(key)
                out.append(value)
        return tuple(out)

    @staticmethod
    def _dedupe_quantifiers(values: Iterable[Quantifier]) -> tuple[Quantifier, ...]:
        seen: set[tuple[str, str, str]] = set()
        out: list[Quantifier] = []
        for value in values:
            key = (value.surface, value.kind, value.scope)
            if key not in seen:
                seen.add(key)
                out.append(value)
        return tuple(out)


__all__ = [
    "LanguageToken",
    "SemanticRole",
    "Quantifier",
    "Comparison",
    "Conditional",
    "LanguageClause",
    "LanguageAnalysis",
    "LanguageIntelligence",
]