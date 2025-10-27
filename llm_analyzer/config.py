import json
import logging
import os
from pathlib import Path
from typing import Dict

APP_DIR_NAME = ".llm_analyzer"
DB_FILE_NAME = "llm_analyzer.sqlite"
LOG_FILE_NAME = "app.log"
CONFIG_FILE_NAME = "config.json"


def ensure_dir(path: Path) -> None:
	path.mkdir(parents=True, exist_ok=True)


def get_app_paths() -> Dict[str, Path]:
	home = Path.home()
	app_dir = home / APP_DIR_NAME
	ensure_dir(app_dir)

	paths = {
		"app_dir": app_dir,
		"db_path": app_dir / DB_FILE_NAME,
		"log_path": app_dir / LOG_FILE_NAME,
		"config_path": app_dir / CONFIG_FILE_NAME,
	}
	_setup_logging(paths["log_path"])  # initialize logging early
	return paths


def _setup_logging(log_path: Path) -> None:
	log_path.parent.mkdir(parents=True, exist_ok=True)
	logging.basicConfig(
		level=logging.INFO,
		format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
		handlers=[
			logging.FileHandler(log_path, encoding="utf-8"),
			logging.StreamHandler(),
		],
	)


def load_config(paths: Dict[str, Path]) -> Dict[str, object]:
	try:
		if paths["config_path"].exists():
			return json.loads(paths["config_path"].read_text(encoding="utf-8"))
	except Exception:
		logging.exception("Failed to load config; using defaults")
	return {}


def save_config(paths: Dict[str, Path], cfg: Dict[str, object]) -> None:
	try:
		paths["config_path"].write_text(json.dumps(cfg, indent=2), encoding="utf-8")
	except Exception:
		logging.exception("Failed to save config")
