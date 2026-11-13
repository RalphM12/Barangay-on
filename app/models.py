"""Database models (SQLAlchemy). Works on SQLite (dev/testing) and MySQL (deployment)."""
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects import mysql
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# MEDIUMTEXT on MySQL (signatures are base64 images), plain TEXT elsewhere
LongText = db.Text().with_variant(mysql.MEDIUMTEXT(), "mysql")


def _load_tz():
    """Barangay local time (Philippines by default). Set APP_TIMEZONE to change it.

    Hosts such as Wasmer run in UTC, so the server clock must not be used directly.
    """
    name = os.environ.get("APP_TIMEZONE", "Asia/Manila")
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(name)
    except Exception:  # no tz database on this host: Philippines has no daylight saving, UTC+8
        return timezone(timedelta(hours=8)) if name == "Asia/Manila" else timezone.utc


APP_TZ = _load_tz()


def now() -> datetime:
    """Current barangay time (naive, no microseconds) for storing in the database."""
    return datetime.now(APP_TZ).replace(microsecond=0, tzinfo=None)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    position = db.Column(db.String(80), nullable=False, default="")
    role = db.Column(db.String(10), nullable=False)  # resident | staff | admin | captain
    avatar = db.Column(db.String(80))                 # file name inside uploads/avatars/
    signature = db.Column(LongText)                   # captain's own signature (PNG data URL)
    term_start = db.Column(db.Date)
    term_ended_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, nullable=False, default=now)


class Resident(db.Model):
    __tablename__ = "residents"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    first_name = db.Column(db.String(60), nullable=False)
    middle_name = db.Column(db.String(60), nullable=False, default="")
    last_name = db.Column(db.String(60), nullable=False)
    address = db.Column(db.String(150), nullable=False, default="")
    birthdate = db.Column(db.Date)
    civil_status = db.Column(db.String(20))
    sex = db.Column(db.String(10))                    # Male | Female
    contact_no = db.Column(db.String(20), nullable=False, default="")
    status = db.Column(db.String(12), nullable=False, default="Registered")  # Registered | Pending | Inactive
    created_at = db.Column(db.DateTime, nullable=False, default=now)
    deleted_at = db.Column(db.DateTime)               # set by "Delete resident": hidden, records kept
    is_walkin = db.Column(db.Boolean, nullable=False, default=False)  # non-registered person typed in by staff


class Service(db.Model):
    __tablename__ = "services"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(10), nullable=False)  # document | complaint | report


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.Integer, primary_key=True)
    tracking_no = db.Column(db.String(30), nullable=False, unique=True)
    resident_id = db.Column(db.Integer, db.ForeignKey("residents.id"), nullable=False)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=False)
    # Documents: Pending -> Approved -> Released.  Complaints / reports: Under Review | Resolved | Rejected.
    status = db.Column(db.String(15), nullable=False, default="Under Review", index=True)
    details = db.Column(db.Text)
    released_at = db.Column(db.DateTime, index=True)
    released_by = db.Column(db.Integer)
    approved_at = db.Column(db.DateTime)
    approved_by = db.Column(db.Integer)
    endorsed_at = db.Column(db.DateTime)      # forwarded to the captain for signing
    endorsed_by = db.Column(db.Integer)
    signed_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    signed_at = db.Column(db.DateTime)
    signed_by_name = db.Column(db.String(100))
    signature_snapshot = db.Column(LongText)  # the signature as it was the day the captain signed
    created_at = db.Column(db.DateTime, nullable=False, default=now, index=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=now, onupdate=now)

    resident = db.relationship("Resident")
    service = db.relationship("Service")


class UserPermission(db.Model):
    __tablename__ = "user_permissions"
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    permission = db.Column(db.String(40), primary_key=True)


class UserSetting(db.Model):
    __tablename__ = "user_settings"
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme = db.Column(db.String(10), nullable=False, default="light")
    font_size = db.Column(db.String(10), nullable=False, default="medium")
    density = db.Column(db.String(12), nullable=False, default="comfortable")
    sidebar_collapsed = db.Column(db.Integer, nullable=False, default=0)
    date_format = db.Column(db.String(6), nullable=False, default="mdy")
    time_format = db.Column(db.String(4), nullable=False, default="12h")
    default_page = db.Column(db.String(30), nullable=False, default="dashboard")
    page_size = db.Column(db.Integer, nullable=False, default=10)
    notify_announcements = db.Column(db.Integer, nullable=False, default=1)
    notify_requests = db.Column(db.Integer, nullable=False, default=1)
    session_timeout = db.Column(db.Integer, nullable=False, default=30)
    updated_at = db.Column(db.DateTime, nullable=False, default=now, onupdate=now)


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    message = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(10), nullable=False, default="info")  # success | info | warning | alert
    is_read = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=now)


class ActivityLog(db.Model):
    __tablename__ = "activity_log"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer)
    username = db.Column(db.String(50), nullable=False, default="")
    action = db.Column(db.String(60), nullable=False)
    detail = db.Column(db.String(255), nullable=False, default="")
    ip = db.Column(db.String(45), nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=now, index=True)


class Announcement(db.Model):
    __tablename__ = "announcements"
    id = db.Column(db.Integer, primary_key=True)
    posted_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String(150), nullable=False)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=now)


class LoginAttempt(db.Model):
    """Failed logins / registrations, used to slow down password guessing. Old rows are deleted automatically."""
    __tablename__ = "login_attempts"
    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(10), nullable=False)       # login | register
    key = db.Column(db.String(120), nullable=False)       # "u:<username>" or "ip:<address>"
    created_at = db.Column(db.DateTime, nullable=False, default=now)
    __table_args__ = (db.Index("ix_attempt_lookup", "kind", "key", "created_at"),)
