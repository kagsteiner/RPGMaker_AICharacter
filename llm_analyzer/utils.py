from __future__ import annotations

import datetime as dt
import math
from typing import Iterable, List, Optional


def normalize_llm_name(name: str) -> str:
	return name.strip().lower()


def parse_iso_datetime_to_utc(value: str) -> Optional[dt.datetime]:
	if not value:
		return None
	# Try fromisoformat first; handle 'Z'
	text = value.strip()
	if text.endswith("Z"):
		text = text[:-1] + "+00:00"
	try:
		d = dt.datetime.fromisoformat(text)
	except ValueError:
		return None
	# If naive, assume local and convert to UTC
	if d.tzinfo is None:
		local = d.astimezone()
		return local.astimezone(dt.timezone.utc)
	return d.astimezone(dt.timezone.utc)


def utc_from_local_naive(d: dt.datetime) -> dt.datetime:
	if d.tzinfo is not None:
		return d.astimezone(dt.timezone.utc)
	local = d.astimezone()
	return local.astimezone(dt.timezone.utc)


def nearest_rank_percentile(values: Iterable[int], p: float) -> Optional[float]:
	data: List[int] = sorted(int(v) for v in values)
	n = len(data)
	if n == 0:
		return None
	p = max(0.0, min(1.0, p))
	rank = int(math.ceil(p * n))
	index = max(0, rank - 1)
	return float(data[index])
