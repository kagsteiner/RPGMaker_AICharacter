from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from . import db
from .utils import normalize_llm_name, parse_iso_datetime_to_utc


def import_performance_log_file(
	conn,
	file_path: Path,
	*,
	format_hint: Optional[str] = None,
	custom_regex: Optional[str] = None,
	store_raw_line: bool = True,
) -> Dict[str, int]:
	path = Path(file_path)
	batch_id = db.new_import_batch_id()
	imported_at = db.utc_now_iso()
	insert_rows: List[Dict[str, object]] = []
	skipped = 0
	processed = 0

	if custom_regex:
		pattern = re.compile(custom_regex)
		for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
			if not line.strip():
				continue
			m = pattern.search(line)
			if not m:
				skipped += 1
				continue
			llm = m.groupdict().get("llm_name")
			duration = m.groupdict().get("duration_ms")
			ts = m.groupdict().get("call_timestamp")
			if not llm or not duration:
				skipped += 1
				continue
			try:
				dur = int(duration)
			except Exception:
				skipped += 1
				continue
			if dur <= 0:
				skipped += 1
				continue
			call_ts_utc = parse_iso_datetime_to_utc(ts).isoformat() if ts else None
			insert_rows.append(
				{
					"imported_at": imported_at,
					"source_file": str(path),
					"source_line_no": i,
					"llm_name": normalize_llm_name(llm),
					"call_timestamp": call_ts_utc,
					"duration_ms": dur,
					"raw_line": line if store_raw_line else None,
					"import_batch_id": batch_id,
				}
			)
			processed += 1
	elif (format_hint or path.suffix.lower()) in {".csv"}:
		with path.open("r", encoding="utf-8", newline="") as f:
			reader = csv.DictReader(f)
			for i, row in enumerate(reader, start=2):
				llm = row.get("llm_name")
				duration = row.get("duration_ms")
				ts = row.get("call_timestamp")
				if not llm or not duration:
					skipped += 1
					continue
				try:
					dur = int(str(duration).strip())
				except Exception:
					skipped += 1
					continue
				if dur <= 0:
					skipped += 1
					continue
				call_ts_utc = parse_iso_datetime_to_utc(ts).isoformat() if ts else None
				insert_rows.append(
					{
						"imported_at": imported_at,
						"source_file": str(path),
						"source_line_no": i,
						"llm_name": normalize_llm_name(llm),
						"call_timestamp": call_ts_utc,
						"duration_ms": dur,
						"raw_line": None,
						"import_batch_id": batch_id,
					}
				)
				processed += 1
	else:
		# JSONL assumed
		for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
			if not line.strip():
				continue
			try:
				obj = json.loads(line)
			except Exception:
				skipped += 1
				continue
			llm = obj.get("llm_name")
			duration = obj.get("duration_ms")
			ts = obj.get("call_timestamp")
			if not llm or duration is None:
				skipped += 1
				continue
			try:
				dur = int(duration)
			except Exception:
				skipped += 1
				continue
			if dur <= 0:
				skipped += 1
				continue
			call_ts_utc = parse_iso_datetime_to_utc(ts).isoformat() if ts else None
			insert_rows.append(
				{
					"imported_at": imported_at,
					"source_file": str(path),
					"source_line_no": i,
					"llm_name": normalize_llm_name(llm),
					"call_timestamp": call_ts_utc,
					"duration_ms": dur,
					"raw_line": line if store_raw_line else None,
					"import_batch_id": batch_id,
				}
			)
			processed += 1

	with db.transaction(conn):
		if insert_rows:
			db.insert_llm_calls(conn, insert_rows)

	return {"inserted": len(insert_rows), "skipped": skipped, "processed": processed}


def import_session_json_file(
	conn,
	file_path: Path,
) -> Dict[str, int]:
	path = Path(file_path)
	payload = json.loads(path.read_text(encoding="utf-8"))
	if not isinstance(payload, dict):
		raise ValueError("Session JSON must be an object")
	llm_name = payload.get("llm_name")
	interactions = payload.get("interactions")
	if not llm_name or not isinstance(interactions, list):
		raise ValueError("Missing llm_name or interactions[]")
	llm_name_norm = normalize_llm_name(llm_name)
	started_at = payload.get("started_at")
	session_guid = payload.get("session_guid")
	started_at_utc = parse_iso_datetime_to_utc(started_at).isoformat() if started_at else None

	checksum = db.session_checksum(payload)
	batch_id = db.new_import_batch_id()
	imported_at = db.utc_now_iso()

	# Deduplicate
	exists = list(
		conn.execute("SELECT id FROM sessions WHERE checksum = ?", (checksum,))
	)
	if exists:
		return {"inserted_sessions": 0, "inserted_interactions": 0, "skipped_duplicates": 1}

	# Build interactions
	insert_interactions: List[Dict[str, object]] = []
	inserted = 0
	for idx, item in enumerate(interactions):
		if not isinstance(item, dict):
			continue
		t_ms = item.get("t_ms")
		situation_id = item.get("situation_id")
		prompt = item.get("prompt")
		response = item.get("response")
		if t_ms is None or situation_id is None or prompt is None or response is None:
			continue
		try:
			t_ms_int = int(t_ms)
		except Exception:
			continue
		if t_ms_int < 0:
			continue
		interaction_ts_src = item.get("timestamp")
		if started_at_utc:
			base = parse_iso_datetime_to_utc(started_at).timestamp()
			abs_ts = base + (t_ms_int / 1000.0)
			interaction_dt = parse_iso_datetime_to_utc(started_at)
			interaction_dt = interaction_dt.fromtimestamp(abs_ts, tz=interaction_dt.tzinfo)  # reuse tz
			interaction_iso = interaction_dt.astimezone().astimezone().isoformat()
		else:
			interaction_iso = None
		extra_obj = item.get("extra")
		extra_text = json.dumps(extra_obj, ensure_ascii=False) if isinstance(extra_obj, (dict, list)) else None
		insert_interactions.append(
			{
				"interaction_timestamp": interaction_iso,
				"offset_ms": t_ms_int,
				"situation_id": str(situation_id),
				"prompt": str(prompt),
				"response": str(response),
				"comment": None,
				"rating": None,
				"llm_name": llm_name_norm,
				"index_in_session": idx,
				"extra": extra_text,
			}
		)
		inserted += 1

	session_row = {
		"session_guid": session_guid,
		"session_timestamp": started_at_utc,
		"llm_name": llm_name_norm,
		"source_file": str(path),
		"imported_at": imported_at,
		"import_batch_id": batch_id,
		"checksum": checksum,
	}

	with db.transaction(conn):
		db.insert_session_with_interactions(conn, session_row, insert_interactions)

	return {"inserted_sessions": 1, "inserted_interactions": inserted, "skipped_duplicates": 0}
