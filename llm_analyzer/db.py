from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

SCHEMA_VERSION = 1


def get_connection(db_path: Path) -> sqlite3.Connection:
	conn = sqlite3.connect(str(db_path))
	conn.row_factory = sqlite3.Row
	conn.execute("PRAGMA foreign_keys = ON;")
	return conn


def initialize_schema(conn: sqlite3.Connection) -> None:
	cur = conn.cursor()
	cur.execute(
		"""
		CREATE TABLE IF NOT EXISTS meta (
			key TEXT PRIMARY KEY,
			value TEXT
		);
		"""
	)
	cur.execute(
		"""
		CREATE TABLE IF NOT EXISTS llm_calls (
			id INTEGER PRIMARY KEY,
			imported_at TEXT NOT NULL,
			source_file TEXT NOT NULL,
			source_line_no INTEGER,
			llm_name TEXT NOT NULL,
			call_timestamp TEXT,
			duration_ms INTEGER NOT NULL,
			raw_line TEXT,
			import_batch_id TEXT NOT NULL
		);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_llm_calls_llm ON llm_calls(llm_name);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_llm_calls_time ON llm_calls(call_timestamp);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_llm_calls_duration ON llm_calls(duration_ms);
		"""
	)

	cur.execute(
		"""
		CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY,
			session_guid TEXT,
			session_timestamp TEXT,
			llm_name TEXT NOT NULL,
			source_file TEXT NOT NULL,
			imported_at TEXT NOT NULL,
			import_batch_id TEXT NOT NULL,
			checksum TEXT NOT NULL UNIQUE
		);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_sessions_time ON sessions(session_timestamp);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_sessions_llm ON sessions(llm_name);
		"""
	)

	cur.execute(
		"""
		CREATE TABLE IF NOT EXISTS interactions (
			id INTEGER PRIMARY KEY,
			session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			interaction_timestamp TEXT,
			offset_ms INTEGER NOT NULL,
			situation_id TEXT NOT NULL,
			prompt TEXT NOT NULL,
			response TEXT NOT NULL,
			comment TEXT,
			rating TEXT CHECK (rating IN ('okay','not_okay')),
			llm_name TEXT,
			index_in_session INTEGER,
			extra TEXT
		);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_interactions_situation ON interactions(situation_id);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_interactions_rating ON interactions(rating);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_interactions_time ON interactions(interaction_timestamp);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_interactions_offset ON interactions(offset_ms);
		"""
	)
	cur.execute(
		"""
		CREATE INDEX IF NOT EXISTS idx_interactions_llm ON interactions(llm_name);
		"""
	)

	cur.execute(
		"INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version', ?);",
		(str(SCHEMA_VERSION),),
	)
	conn.commit()


@contextmanager
def transaction(conn: sqlite3.Connection):
	try:
		conn.execute("BEGIN;")
		yield
		conn.commit()
	except Exception:
		conn.rollback()
		raise


# Utilities

def utc_now_iso() -> str:
	return datetime.now(timezone.utc).isoformat()


def new_import_batch_id() -> str:
	return str(uuid.uuid4())


def session_checksum(payload: dict) -> str:
	blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
	return hashlib.sha256(blob).hexdigest()


# Inserts

def insert_llm_calls(
	conn: sqlite3.Connection,
	rows: Iterable[Dict[str, object]],
) -> None:
	cur = conn.cursor()
	cur.executemany(
		"""
		INSERT INTO llm_calls(imported_at, source_file, source_line_no, llm_name, call_timestamp, duration_ms, raw_line, import_batch_id)
		VALUES(:imported_at, :source_file, :source_line_no, :llm_name, :call_timestamp, :duration_ms, :raw_line, :import_batch_id)
		""",
		list(rows),
	)


def insert_session_with_interactions(
	conn: sqlite3.Connection,
	session_row: Dict[str, object],
	interactions_rows: Iterable[Dict[str, object]],
) -> int:
	cur = conn.cursor()
	cur.execute(
		"""
		INSERT INTO sessions(session_guid, session_timestamp, llm_name, source_file, imported_at, import_batch_id, checksum)
		VALUES(:session_guid, :session_timestamp, :llm_name, :source_file, :imported_at, :import_batch_id, :checksum)
		""",
		session_row,
	)
	session_id = int(cur.lastrowid)
	rows = []
	for r in interactions_rows:
		r = dict(r)
		r["session_id"] = session_id
		rows.append(r)
	cur.executemany(
		"""
		INSERT INTO interactions(session_id, interaction_timestamp, offset_ms, situation_id, prompt, response, comment, rating, llm_name, index_in_session, extra)
		VALUES(:session_id, :interaction_timestamp, :offset_ms, :situation_id, :prompt, :response, :comment, :rating, :llm_name, :index_in_session, :extra)
		""",
		rows,
	)
	return session_id


# Queries for UI

def fetch_performance_overview(
	conn: sqlite3.Connection,
	llm_filter: Optional[str] = None,
	date_from_iso: Optional[str] = None,
	date_to_iso: Optional[str] = None,
) -> List[sqlite3.Row]:
	conds = []
	args: List[object] = []
	if llm_filter:
		conds.append("llm_name LIKE ?")
		args.append(f"%{llm_filter}%")
	if date_from_iso:
		conds.append("COALESCE(call_timestamp, imported_at) >= ?")
		args.append(date_from_iso)
	if date_to_iso:
		conds.append("COALESCE(call_timestamp, imported_at) <= ?")
		args.append(date_to_iso)
	where = f"WHERE {' AND '.join(conds)}" if conds else ""
	return list(
		conn.execute(
			f"""
			SELECT llm_name,
				COUNT(*) AS cnt,
				MIN(duration_ms) AS min_ms,
				AVG(duration_ms) AS avg_ms,
				MAX(duration_ms) AS max_ms
			FROM llm_calls
			{where}
			GROUP BY llm_name
			ORDER BY llm_name
			""",
			args,
		)
	)


def fetch_sessions(conn: sqlite3.Connection) -> List[sqlite3.Row]:
	return list(
		conn.execute(
			"""
			SELECT id, session_guid, session_timestamp, llm_name, source_file, imported_at
			FROM sessions
			ORDER BY COALESCE(session_timestamp, imported_at) DESC
			"""
		)
	)


def fetch_interactions_for_session(conn: sqlite3.Connection, session_id: int) -> List[sqlite3.Row]:
	return list(
		conn.execute(
			"""
			SELECT *
			FROM interactions
			WHERE session_id = ?
			ORDER BY offset_ms ASC, COALESCE(index_in_session, 0) ASC
			""",
			(session_id,),
		)
	)


def update_interaction_annotation(
	conn: sqlite3.Connection,
	interaction_id: int,
	comment: Optional[str],
	rating: Optional[str],
) -> None:
    conn.execute(
        "UPDATE interactions SET comment = ?, rating = ? WHERE id = ?",
        (comment, rating, interaction_id),
    )
    conn.commit()


def fetch_llm_and_situations(conn: sqlite3.Connection) -> Tuple[List[str], List[str]]:
	llms = [r[0] for r in conn.execute("SELECT DISTINCT llm_name FROM sessions ORDER BY llm_name")] + [
			r[0] for r in conn.execute("SELECT DISTINCT llm_name FROM interactions WHERE llm_name IS NOT NULL ORDER BY llm_name")
		]
	situations = [r[0] for r in conn.execute("SELECT DISTINCT situation_id FROM interactions ORDER BY situation_id")]
	# Deduplicate llms while preserving order
	seen = set()
	unique_llms: List[str] = []
	for n in llms:
		if n and n not in seen:
			seen.add(n)
			unique_llms.append(n)
	return unique_llms, situations


def fetch_review(
	conn: sqlite3.Connection,
	llm_name: Optional[str],
	situation_id: Optional[str],
) -> Tuple[int, int, List[sqlite3.Row]]:
	conds = []
	args: List[object] = []
	if llm_name:
		conds.append("interactions.llm_name = ?")
		args.append(llm_name)
	if situation_id:
		conds.append("interactions.situation_id = ?")
		args.append(situation_id)
	where = f"WHERE {' AND '.join(conds)}" if conds else ""
	rows = list(
		conn.execute(
			f"""
			SELECT interactions.*, sessions.session_timestamp
			FROM interactions
			JOIN sessions ON sessions.id = interactions.session_id
			{where}
			ORDER BY COALESCE(interactions.interaction_timestamp, interactions.offset_ms) ASC
			""",
			args,
		)
	)
	okay = sum(1 for r in rows if r["rating"] == "okay")
	not_okay = sum(1 for r in rows if r["rating"] == "not_okay")
	return okay, not_okay, rows


def fetch_durations_grouped(
	conn: sqlite3.Connection,
	llm_filter: Optional[str] = None,
	date_from_iso: Optional[str] = None,
	date_to_iso: Optional[str] = None,
) -> Dict[str, List[int]]:
	conds = []
	args: List[object] = []
	if llm_filter:
		conds.append("llm_name LIKE ?")
		args.append(f"%{llm_filter}%")
	if date_from_iso:
		conds.append("COALESCE(call_timestamp, imported_at) >= ?")
		args.append(date_from_iso)
	if date_to_iso:
		conds.append("COALESCE(call_timestamp, imported_at) <= ?")
		args.append(date_to_iso)
	where = f"WHERE {' AND '.join(conds)}" if conds else ""
	rows = conn.execute(
		f"SELECT llm_name, duration_ms FROM llm_calls {where} ORDER BY llm_name",
		args,
	)
	result: Dict[str, List[int]] = {}
	for r in rows:
		name = r["llm_name"]
		d = int(r["duration_ms"]) if r["duration_ms"] is not None else None
		if d is None:
			continue
		result.setdefault(name, []).append(d)
	return result
