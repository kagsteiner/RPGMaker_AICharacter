import logging
from pathlib import Path

from . import db
from .config import get_app_paths
from .gui import AnalyzerApp


def main() -> None:
	paths = get_app_paths()
	# Ensure database exists and schema is initialized
	conn = db.get_connection(paths["db_path"])  # noqa: SIM115
	db.initialize_schema(conn)
	conn.close()

	app = AnalyzerApp(paths)
	app.mainloop()


if __name__ == "__main__":
	main()
