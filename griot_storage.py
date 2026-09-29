from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import json
import sqlite3
from typing import Iterator

from griot_engine import BaseLayer, Fact, GRIOT, QUID


@dataclass(frozen=True, slots=True)
class StorageStats:
    quids: int
    facts: int


class SQLiteKnowledgeStore:
    """Durable local storage with stable schema and indexed fact retrieval.

    This is the E1 physical backend. Larger-scale sharding and distributed
    retrieval are deliberately implemented in later E phases.
    """

    SCHEMA_VERSION = 1

    def __init__(self, path: str = ":memory:") -> None:
        self.path = path
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self._initialize()

    def close(self) -> None:
        self.connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        try:
            yield self.connection
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def put_quid(self, quid: QUID) -> None:
        payload = json.dumps(quid.metadata, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        with self.transaction() as db:
            db.execute(
                """
                INSERT OR REPLACE INTO quids
                (code, symbol, label, base, family_id, signature, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    quid.code,
                    quid.symbol,
                    quid.label,
                    quid.base.value,
                    quid.family_id,
                    json.dumps(quid.signature, separators=(",", ":")),
                    payload,
                ),
            )

    def put_fact(self, fact: Fact) -> None:
        with self.transaction() as db:
            db.execute(
                """
                INSERT OR IGNORE INTO facts
                (subject, relation, object, confidence, negated, provenance, evidence, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fact.subject,
                    fact.relation,
                    fact.object,
                    float(fact.confidence),
                    int(bool(fact.negated)),
                    fact.provenance,
                    fact.evidence,
                    fact.timestamp,
                ),
            )

    def put_engine(self, engine: GRIOT) -> None:
        with self.transaction() as db:
            for quid in engine.quids.all():
                payload = json.dumps(
                    quid.metadata,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                db.execute(
                    """
                    INSERT OR REPLACE INTO quids
                    (code, symbol, label, base, family_id, signature, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        quid.code,
                        quid.symbol,
                        quid.label,
                        quid.base.value,
                        quid.family_id,
                        json.dumps(quid.signature, separators=(",", ":")),
                        payload,
                    ),
                )
            for fact in engine.graph.facts():
                db.execute(
                    """
                    INSERT OR IGNORE INTO facts
                    (subject, relation, object, confidence, negated, provenance, evidence, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        fact.subject,
                        fact.relation,
                        fact.object,
                        float(fact.confidence),
                        int(bool(fact.negated)),
                        fact.provenance,
                        fact.evidence,
                        fact.timestamp,
                    ),
                )

    def load_engine(self, engine: GRIOT) -> None:
        for row in self.connection.execute(
            "SELECT * FROM quids ORDER BY code"
        ):
            quid = QUID(
                code=int(row["code"]),
                symbol=row["symbol"],
                label=row["label"],
                base=BaseLayer(row["base"]),
                family_id=int(row["family_id"]),
                signature=tuple(json.loads(row["signature"])),
                metadata=json.loads(row["metadata"]),
            )
            engine.quids.load((quid,))

        for row in self.connection.execute(
            """
            SELECT subject, relation, object, confidence, negated,
                   provenance, evidence, timestamp
            FROM facts
            ORDER BY id
            """
        ):
            engine.graph.add_fact(
                Fact(
                    row["subject"],
                    row["relation"],
                    row["object"],
                    float(row["confidence"]),
                    bool(row["negated"]),
                    row["provenance"],
                    row["evidence"],
                    row["timestamp"],
                )
            )

    def get_quid(self, symbol: str) -> QUID | None:
        row = self.connection.execute(
            "SELECT * FROM quids WHERE symbol = ?",
            (symbol,),
        ).fetchone()
        if row is None:
            return None
        return QUID(
            code=int(row["code"]),
            symbol=row["symbol"],
            label=row["label"],
            base=BaseLayer(row["base"]),
            family_id=int(row["family_id"]),
            signature=tuple(json.loads(row["signature"])),
            metadata=json.loads(row["metadata"]),
        )

    def query_facts(
        self,
        *,
        subject: str | None = None,
        relation: str | None = None,
        object_: str | None = None,
        negated: bool | None = None,
        limit: int | None = None,
    ) -> tuple[Fact, ...]:
        clauses: list[str] = []
        values: list[object] = []
        if subject is not None:
            clauses.append("subject = ?")
            values.append(subject)
        if relation is not None:
            clauses.append("relation = ?")
            values.append(relation)
        if object_ is not None:
            clauses.append("object = ?")
            values.append(object_)
        if negated is not None:
            clauses.append("negated = ?")
            values.append(int(negated))

        sql = """
            SELECT subject, relation, object, confidence, negated,
                   provenance, evidence, timestamp
            FROM facts
        """
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY id"
        if limit is not None:
            if limit <= 0:
                raise ValueError("limit must be positive")
            sql += " LIMIT ?"
            values.append(limit)

        rows = self.connection.execute(sql, values).fetchall()
        return tuple(
            Fact(
                row["subject"],
                row["relation"],
                row["object"],
                float(row["confidence"]),
                bool(row["negated"]),
                row["provenance"],
                row["evidence"],
                row["timestamp"],
            )
            for row in rows
        )

    def stats(self) -> StorageStats:
        quids = int(self.connection.execute("SELECT COUNT(*) FROM quids").fetchone()[0])
        facts = int(self.connection.execute("SELECT COUNT(*) FROM facts").fetchone()[0])
        return StorageStats(quids, facts)

    def __enter__(self) -> "SQLiteKnowledgeStore":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def _initialize(self) -> None:
        with self.transaction() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("""
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            db.execute("""
                CREATE TABLE IF NOT EXISTS quids (
                    code INTEGER PRIMARY KEY,
                    symbol TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    base TEXT NOT NULL,
                    family_id INTEGER NOT NULL,
                    signature TEXT NOT NULL,
                    metadata TEXT NOT NULL
                )
            """)
            db.execute("""
                CREATE TABLE IF NOT EXISTS facts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject TEXT NOT NULL,
                    relation TEXT NOT NULL,
                    object TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    negated INTEGER NOT NULL,
                    provenance TEXT NOT NULL,
                    evidence TEXT,
                    timestamp TEXT,
                    UNIQUE(subject, relation, object, confidence, negated, provenance, evidence, timestamp)
                )
            """)
            db.execute("CREATE INDEX IF NOT EXISTS idx_facts_subject_relation ON facts(subject, relation)")
            db.execute("CREATE INDEX IF NOT EXISTS idx_facts_object_relation ON facts(object, relation)")
            db.execute("CREATE INDEX IF NOT EXISTS idx_facts_provenance ON facts(provenance)")
            db.execute(
                "INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)",
                (str(self.SCHEMA_VERSION),),
            )


__all__ = ["SQLiteKnowledgeStore", "StorageStats"]
