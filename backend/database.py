"""
OMNICAT ENTERPRISE - DATABASE CONNECTION MODULE
Manages connections and transactions for OmniCat backend services.
Supports both SQLite (local development / testing) and PostgreSQL (production).
"""

import os
import sqlite3
from contextlib import contextmanager

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "omnicat_local.db")

class Database:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH)

    def get_connection(self) -> sqlite3.Connection:
        """Returns a connection with foreign keys and row factory enabled."""
        conn = sqlite3.connect(self.db_path, timeout=30.0)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        return conn

    @contextmanager
    def transaction(self):
        """Context manager for atomic transaction with immediate write lock."""
        conn = self.get_connection()
        conn.isolation_level = None  # Autocommit mode to manage transactions explicitly
        cursor = conn.cursor()
        try:
            cursor.execute("BEGIN IMMEDIATE;")
            yield cursor
            cursor.execute("COMMIT;")
        except Exception:
            cursor.execute("ROLLBACK;")
            raise
        finally:
            conn.close()

db = Database()
