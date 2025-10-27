from __future__ import annotations

import csv
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Dict, List, Optional
from pathlib import Path

from . import db
from .config import load_config, save_config
from .importers import import_performance_log_file, import_session_json_file
from .utils import nearest_rank_percentile


def _extract_prompt_preview(text: str) -> str:
	lines = str(text or "").splitlines()
	# Prefer the line after the line that starts with "Goal:"
	for i, line in enumerate(lines):
		if line.strip().startswith("Goal:"):
			if i + 1 < len(lines):
				return lines[i + 1].strip()
			return ""
	# Fallback: line after the line that starts with "NPC Description:"
	for i, line in enumerate(lines):
		if line.strip().startswith("NPC Description:"):
			if i + 1 < len(lines):
				return lines[i + 1].strip()
			return ""
	return ""


def _extract_response_preview(text: str) -> str:
	lines = str(text or "").splitlines()
	return lines[0].strip() if lines else ""


class AnalyzerApp(tk.Tk):
	def __init__(self, paths):
		super().__init__()
		self.title("LLM Analyzer")
		self.geometry("1000x700")
		self.paths = paths
		self.config_obj = load_config(paths)
		self.conn = db.get_connection(paths["db_path"])

		self._apply_dark_theme()

		nb = ttk.Notebook(self)
		nb.pack(fill=tk.BOTH, expand=True)

		self.perf_tab = PerformanceTab(nb, self.conn)
		nb.add(self.perf_tab, text="Performance Overview")

		self.session_tab = SessionTab(nb, self.conn)
		nb.add(self.session_tab, text="Session Browser & Annotation")

		self.review_tab = ReviewTab(nb, self.conn)
		nb.add(self.review_tab, text="LLM & Situation Review")

		self.protocol("WM_DELETE_WINDOW", self.on_close)

	def on_close(self):
		try:
			save_config(self.paths, self.config_obj)
		finally:
			self.conn.close()
			self.destroy()

	def _apply_dark_theme(self):
		# Colors
		bg = "#0b0c0e"
		surface = "#131419"
		surface2 = "#17181e"
		fg = "#e6e6e6"
		subtle = "#a9abb3"
		accent = "#3b82f6"
		selection = "#1f2937"
		try:
			style = ttk.Style(self)
			try:
				style.theme_use("clam")
			except Exception:
				pass
			self.configure(bg=bg)
			# Base widgets
			style.configure("TFrame", background=bg)
			style.configure("TLabelframe", background=bg, foreground=fg)
			style.configure("TLabel", background=bg, foreground=fg)
			style.configure("TButton", background=surface2, foreground=fg, borderwidth=1, focusthickness=0)
			style.map("TButton",
				background=[
					("pressed", "#0f1116"),
					("active", surface)
				],
				relief=[
					("pressed", "sunken"),
					("!pressed", "raised")
				]
			)
			# Nav buttons (Prev/Next)
			style.configure("Nav.TButton", background=surface2, foreground=fg, borderwidth=1)
			style.map("Nav.TButton",
				background=[("pressed", "#0f1116"), ("active", surface)],
				relief=[("pressed", "sunken"), ("!pressed", "raised")]
			)
			# Primary action (Save)
			style.configure("Primary.TButton", background=accent, foreground=bg, borderwidth=1)
			style.map("Primary.TButton",
				background=[("pressed", "#2c63bf"), ("active", "#336adf")],
				relief=[("pressed", "sunken"), ("!pressed", "raised")]
			)
			style.configure("TRadiobutton", background=bg, foreground=fg)
			# Notebook
			style.configure("TNotebook", background=bg, borderwidth=0)
			style.configure("TNotebook.Tab", background=surface2, foreground=subtle, lightcolor=surface2, borderwidth=0, padding=(12, 6))
			style.map("TNotebook.Tab",
				background=[("selected", surface)],
				foreground=[("selected", fg)])
			# Treeview
			style.configure("Treeview",
				background=surface,
				fieldbackground=surface,
				foreground=fg,
				bordercolor=surface2,
				borderwidth=0)
			style.map("Treeview",
				background=[("selected", selection)],
				foreground=[("selected", fg)])
			style.configure("Treeview.Heading", background=bg, foreground=fg, bordercolor=bg, borderwidth=0)
			# Combobox
			style.configure("TCombobox",
				fieldbackground=surface,
				background=surface,
				foreground=fg)
			style.map("TCombobox",
				fieldbackground=[("readonly", surface)],
				foreground=[("readonly", fg)])
		except Exception:
			pass


class PerformanceTab(ttk.Frame):
	def __init__(self, parent, conn):
		super().__init__(parent)
		self.conn = conn

		top = ttk.Frame(self)
		top.pack(fill=tk.X)

		self.btn_import = ttk.Button(top, text="Import Performance Log…", command=self.on_import)
		self.btn_import.pack(side=tk.LEFT, padx=6, pady=6)

		self.tree = ttk.Treeview(self, columns=("llm","count","min","avg","p90","max"), show="headings")
		for col, label in (
			("llm","LLM"),
			("count","Count"),
			("min","Min (ms)"),
			("avg","Avg (ms)"),
			("p90","P90 (ms)"),
			("max","Max (ms)"),
		):
			self.tree.heading(col, text=label)
			self.tree.column(col, width=120 if col!="llm" else 200, anchor=tk.CENTER)
		self.tree.pack(fill=tk.BOTH, expand=True)

		self.refresh()

	def refresh(self):
		for i in self.tree.get_children():
			self.tree.delete(i)
		stats = db.fetch_performance_overview(self.conn)
		durations = db.fetch_durations_grouped(self.conn)
		p90_map = {k: int(nearest_rank_percentile(v, 0.90)) if nearest_rank_percentile(v, 0.90) is not None else None for k,v in durations.items()}
		for r in stats:
			name = r["llm_name"]
			p90 = p90_map.get(name)
			values = (
				name,
				int(r["cnt"]),
				int(r["min_ms"]) if r["min_ms"] is not None else "—",
				int(r["avg_ms"]) if r["avg_ms"] is not None else "—",
				p90 if p90 is not None else "—",
				int(r["max_ms"]) if r["max_ms"] is not None else "—",
			)
			self.tree.insert("", tk.END, values=values)

	def on_import(self):
		path = filedialog.askopenfilename(title="Import Performance Log", filetypes=[("CSV","*.csv"),("JSONL","*.jsonl"),("All","*.*")])
		if not path:
			return
		if path.lower().endswith(".csv"):
			res = import_performance_log_file(self.conn, Path(path), format_hint=".csv")
		else:
			res = import_performance_log_file(self.conn, Path(path), format_hint=".jsonl")
		messagebox.showinfo("Import Summary", f"Inserted: {res['inserted']}, Skipped: {res['skipped']}")
		self.refresh()


class SessionTab(ttk.Frame):
	def __init__(self, parent, conn):
		super().__init__(parent)
		self.conn = conn
		self.current_session_id: Optional[int] = None
		self.interactions: List[Dict] = []
		self.current_index: int = 0

		left = ttk.Frame(self)
		left.pack(side=tk.LEFT, fill=tk.Y)

		self.btn_import = ttk.Button(left, text="Import Interaction JSON…", command=self.on_import)
		self.btn_import.pack(fill=tk.X, padx=6, pady=6)

		self.sessions = ttk.Treeview(left, columns=("time","llm","count","source"), show="headings", height=20)
		for col, label, w in (
			("time","Session Time", 180),
			("llm","LLM", 140),
			("count","Interactions", 110),
			("source","Source File", 220),
		):
			self.sessions.heading(col, text=label)
			self.sessions.column(col, width=w, anchor=tk.W)
		self.sessions.pack(fill=tk.BOTH, padx=6, pady=6)
		self.sessions.bind("<<TreeviewSelect>>", self.on_session_select)

		right = ttk.Frame(self)
		right.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

		header = ttk.Frame(right)
		header.pack(fill=tk.X)
		self.lbl_meta = ttk.Label(header, text="")
		self.lbl_meta.pack(side=tk.LEFT, padx=6, pady=6)

		ctrl = ttk.Frame(right)
		ctrl.pack(fill=tk.X)
		self.rating_var = tk.StringVar(value="")
		self.rb_ok = ttk.Radiobutton(ctrl, text="okay", variable=self.rating_var, value="okay")
		self.rb_not = ttk.Radiobutton(ctrl, text="not okay", variable=self.rating_var, value="not_okay")
		self.btn_prev = ttk.Button(ctrl, text="Prev", style="Nav.TButton", command=self.on_prev)
		self.btn_next = ttk.Button(ctrl, text="Next", style="Nav.TButton", command=self.on_next)
		for w in (self.rb_ok, self.rb_not, self.btn_prev, self.btn_next):
			w.pack(side=tk.LEFT, padx=6, pady=6)
		# Pointer cursor for clickable controls
		for w in (self.btn_prev, self.btn_next):
			try:
				w.configure(cursor="hand2")
			except Exception:
				pass

		body = ttk.Frame(right)
		body.pack(fill=tk.BOTH, expand=True)
		self.txt_prompt = tk.Text(body, height=10, wrap=tk.WORD)
		self.txt_response = tk.Text(body, height=10, wrap=tk.WORD)
		self.txt_comment = tk.Text(body, height=5, wrap=tk.WORD)
		# Dark theme for Text widgets
		for t in (self.txt_prompt, self.txt_response, self.txt_comment):
			t.configure(bg="#131419", fg="#e6e6e6", insertbackground="#e6e6e6", highlightthickness=0, bd=0, selectbackground="#1f2937", selectforeground="#e6e6e6")
		self.txt_prompt.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)
		self.txt_response.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)
		self.txt_comment.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)

		self.refresh_sessions()

	def refresh_sessions(self):
		for i in self.sessions.get_children():
			self.sessions.delete(i)
		sess_rows = db.fetch_sessions(self.conn)
		for r in sess_rows:
			cnt = list(self.conn.execute("SELECT COUNT(*) FROM interactions WHERE session_id = ?", (r["id"],)))[0][0]
			time_label = (r["session_timestamp"] or r["imported_at"]) or ""
			self.sessions.insert("", tk.END, iid=str(r["id"]), values=(time_label, r["llm_name"], cnt, r["source_file"]))

	def on_session_select(self, event):
		sel = self.sessions.selection()
		if not sel:
			return
		self._save_current()
		session_id = int(sel[0])
		self.current_session_id = session_id
		rows = db.fetch_interactions_for_session(self.conn, session_id)
		self.interactions = [dict(r) for r in rows]
		self.current_index = 0
		self.load_current()

	def load_current(self):
		if not self.interactions:
			return
		item = self.interactions[self.current_index]
		time_display = item.get("interaction_timestamp") or f"t={item.get('offset_ms',0)} ms"
		self.lbl_meta.config(text=f"Time: {time_display} | Situation: {item.get('situation_id','')} | LLM: {item.get('llm_name','')}")
		self.txt_prompt.delete("1.0", tk.END)
		self.txt_prompt.insert("1.0", item.get("prompt",""))
		self.txt_response.delete("1.0", tk.END)
		self.txt_response.insert("1.0", item.get("response",""))
		self.txt_comment.delete("1.0", tk.END)
		self.txt_comment.insert("1.0", item.get("comment") or "")
		self.rating_var.set(item.get("rating") or "")

	def _save_current(self):
		"""Save the current interaction's annotation."""
		if not self.interactions:
			return
		item = self.interactions[self.current_index]
		comment = self.txt_comment.get("1.0", tk.END).strip()
		rating = self.rating_var.get() or None
		db.update_interaction_annotation(self.conn, int(item["id"]), comment or None, rating)
		item["comment"] = comment or None
		item["rating"] = rating

	def on_prev(self):
		if self.current_index > 0:
			self._save_current()
			self.current_index -= 1
			self.load_current()

	def on_next(self):
		if self.current_index + 1 < len(self.interactions):
			self._save_current()
			self.current_index += 1
			self.load_current()

	def on_import(self):
		path = filedialog.askopenfilename(title="Import Session JSON", filetypes=[("JSON","*.json"),("All","*.*")])
		if not path:
			return
		try:
			res = import_session_json_file(self.conn, Path(path))
		except Exception as e:
			messagebox.showerror("Import Error", str(e))
			return
		messagebox.showinfo("Import Summary", f"Inserted sessions: {res['inserted_sessions']}, interactions: {res['inserted_interactions']}")
		self.refresh_sessions()


class ReviewTab(ttk.Frame):
	def __init__(self, parent, conn):
		super().__init__(parent)
		self.conn = conn

		filters = ttk.Frame(self)
		filters.pack(fill=tk.X)
		self.llm_var = tk.StringVar(value="")
		self.sit_var = tk.StringVar(value="")
		self.cmb_llm = ttk.Combobox(filters, textvariable=self.llm_var, values=self._load_llms(), width=30)
		self.cmb_sit = ttk.Combobox(filters, textvariable=self.sit_var, values=self._load_situations(), width=30)
		self.btn_apply = ttk.Button(filters, text="Apply", command=self.refresh)
		self.btn_export = ttk.Button(filters, text="Export CSV", command=self.on_export)
		for w in (self.cmb_llm, self.cmb_sit, self.btn_apply, self.btn_export):
			w.pack(side=tk.LEFT, padx=6, pady=6)

		self.lbl_summary = ttk.Label(self, text="")
		self.lbl_summary.pack(fill=tk.X, padx=6, pady=6)

		self.tree = ttk.Treeview(self, columns=("itime","stime","prompt","response","comment","rating"), show="headings")
		for col, label, w in (
			("itime","Interaction Time",140),
			("stime","Session Time",140),
			("prompt","Prompt",260),
			("response","Response",260),
			("comment","Comment",200),
			("rating","Rating",80),
		):
			self.tree.heading(col, text=label)
			self.tree.column(col, width=w, anchor=tk.W)
		self.tree.pack(fill=tk.BOTH, expand=True)

		self.refresh()

	def _load_llms(self) -> List[str]:
		llms, _ = db.fetch_llm_and_situations(self.conn)
		return [""] + llms

	def _load_situations(self) -> List[str]:
		_, sits = db.fetch_llm_and_situations(self.conn)
		return [""] + sits

	def refresh(self):
		for i in self.tree.get_children():
			self.tree.delete(i)
		llm = self.llm_var.get().strip() or None
		sit = self.sit_var.get().strip() or None
		ok, not_ok, rows = db.fetch_review(self.conn, llm, sit)
		den = ok + not_ok
		ok_score = (ok / den) if den else None
		self.lbl_summary.config(text=f"okay: {ok} | not_okay: {not_ok} | OK score: {ok_score:.2f}" if ok_score is not None else "okay: 0 | not_okay: 0 | OK score: —")
		for r in rows:
			itime = r["interaction_timestamp"] or f"t={r['offset_ms']} ms"
			stime = r["session_timestamp"] or ""
			prompt = _extract_prompt_preview(r["prompt"])[:200]
			response = _extract_response_preview(r["response"])[:200]
			comment = (r["comment"] or "")[:200]
			rating = r["rating"] or ""
			self.tree.insert("", tk.END, values=(itime, stime, prompt, response, comment, rating))

	def on_export(self):
		path = filedialog.asksaveasfilename(title="Export CSV", defaultextension=".csv", filetypes=[("CSV","*.csv")])
		if not path:
			return
		llm = self.llm_var.get().strip() or None
		sit = self.sit_var.get().strip() or None
		_, _, rows = db.fetch_review(self.conn, llm, sit)
		with open(path, "w", encoding="utf-8", newline="") as f:
			writer = csv.writer(f)
			writer.writerow(["interaction_time","session_time","prompt","response","comment","rating"]) 
			for r in rows:
				writer.writerow([
					r["interaction_timestamp"] or f"t={r['offset_ms']} ms",
					r["session_timestamp"] or "",
					r["prompt"] or "",
					r["response"] or "",
					r["comment"] or "",
					r["rating"] or "",
				])
			messagebox.showinfo("Export", "CSV exported.")
