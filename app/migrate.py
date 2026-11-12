"""Bring an EXISTING database up to date.

``db.create_all()`` only creates tables that are missing. If the database already has older tables (for example the
ones created by the original PHP version), columns added later - users.signature, transactions.endorsed_at,
residents.is_walkin ... - would be missing and saving would fail with "Unknown column". This adds them.
Nothing is ever dropped or changed, and existing data is kept.
"""
import logging

from sqlalchemy import inspect, text

from .models import db

log = logging.getLogger(__name__)


def _default_sql(column):
    """A literal DEFAULT for simple Python defaults (0 / 1 / False / 'text'); callables like now() are skipped."""
    d = column.default
    if d is None or not getattr(d, "is_scalar", False):
        return ""
    v = d.arg
    if isinstance(v, bool):
        return f" DEFAULT {int(v)}"
    if isinstance(v, (int, float)):
        return f" DEFAULT {v}"
    if isinstance(v, str):
        return " DEFAULT '" + v.replace("'", "''") + "'"
    return ""


def upgrade_schema() -> list:
    """Create missing tables and add missing columns. Returns a list of what was added."""
    added = []
    db.create_all()
    engine = db.engine
    insp = inspect(engine)
    quote = engine.dialect.identifier_preparer.quote
    for table in db.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        have = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in have:
                continue
            ddl = (f"ALTER TABLE {quote(table.name)} ADD COLUMN {quote(col.name)} "
                   f"{col.type.compile(dialect=engine.dialect)}{_default_sql(col)} NULL")
            with engine.begin() as conn:
                conn.execute(text(ddl))
            added.append(f"{table.name}.{col.name}")
            log.warning("Database upgraded: added column %s.%s", table.name, col.name)
    return added
