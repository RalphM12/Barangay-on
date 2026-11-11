"""Session, role checks, CSRF, permissions, notifications and other helpers shared by every page and API.

This is authentication, permissions and shared helpers.
"""
import base64
import hmac
import re
import secrets
import zlib
from datetime import date, datetime, timedelta
from pathlib import Path

import bcrypt
from flask import abort, current_app, g, redirect, request, session, url_for
from sqlalchemy import and_, func, or_, select, update

from .models import (
    ActivityLog, Notification, Resident, Service, Transaction, User, UserPermission, UserSetting, db, now,
)

# --------------------------------------------------------------------------------------
#  Errors -> JSON
# --------------------------------------------------------------------------------------


class ApiError(Exception):
    """Raise anywhere inside an API view: the app turns it into ``{"error": message}`` with the HTTP code."""

    def __init__(self, message: str, code: int = 400, **extra):
        super().__init__(message)
        self.message, self.code, self.extra = message, code, extra


# --------------------------------------------------------------------------------------
#  Passwords (bcrypt, compatible with the $2y$ hashes the PHP version stored)
# --------------------------------------------------------------------------------------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt(rounds=10)).decode("ascii")


# bcrypt of the word "password": what the demo accounts use. Never accepted unless demo logins are switched on.
DEMO_PASSWORD_HASH = "$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi"

_COMMON_PASSWORDS = {
    "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "qwertyuiop", "qwerty123",
    "1234567890", "123456789", "12345678910", "0123456789", "abcdefghij", "iloveyou12", "welcome123",
    "admin12345", "admin123456", "barangay123", "barangayon", "barangay-on", "letmein123", "changeme123",
}


def password_problem(password: str, username: str = "") -> str:
    """Return a message when the password is too weak, or '' when it is fine."""
    p = password or ""
    if len(p) < 10:
        return "Password must be at least 10 characters."
    if len(p.encode("utf-8")) > 72:
        return "Password is too long (72 characters maximum)."
    low = p.lower()
    if low in _COMMON_PASSWORDS or len(set(low)) < 4 or p.isdigit():
        return "That password is too easy to guess. Use a longer, less common one (a few unrelated words works well)."
    if username and len(username) >= 4 and username.lower() in low:
        return "The password must not contain the username."
    return ""


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], (password_hash or "").encode("ascii"))
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------------------
#  Small utilities
# --------------------------------------------------------------------------------------

ROLE_HOME = {
    "admin": "admin.dashboard",
    "staff": "staff.dashboard",
    "captain": "captain.dashboard",
    "resident": "resident.dashboard",
}
ROLE_LABELS = {"admin": "Administrator", "staff": "Staff", "captain": "Barangay Captain", "resident": "Resident"}


def clean_text(value) -> str:
    """trim()."""
    return (value or "").strip() if isinstance(value, str) else ""


def squash(value) -> str:
    """Trim and collapse runs of whitespace into one space."""
    return " ".join(str(value or "").split())


def valid_date(s: str) -> str:
    """Return ``s`` when it is a real Y-m-d date, else ''."""
    try:
        return s if datetime.strptime(s, "%Y-%m-%d").strftime("%Y-%m-%d") == s else ""
    except (ValueError, TypeError):
        return ""


def parse_date(s: str):
    return datetime.strptime(s, "%Y-%m-%d").date()


def reg_no(resident_id: int) -> str:
    return f"RES-{int(resident_id):05d}"


def category_prefix(category: str) -> str:
    return {"document": "BRG", "complaint": "CMP", "report": "RPT"}.get(category, "TRX")


def page_args(default_per: int = 10):
    page = max(1, request.args.get("page", 1, type=int) or 1)
    per = min(50, max(1, request.args.get("per_page", default_per, type=int) or default_per))
    return page, per


def row_dict(row) -> dict:
    return dict(row._mapping)


def fmt_value(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    return v


def rows(result) -> list:
    """Execute-result -> list of plain dicts (dates become strings like MySQL returns them)."""
    return [{k: fmt_value(v) for k, v in r._mapping.items()} for r in result]


def full_name_expr(model=Resident):
    return model.first_name + " " + model.last_name


# --------------------------------------------------------------------------------------
#  Session / current user / role checks
# --------------------------------------------------------------------------------------


def current_user():
    return session.get("user")


def home_for(role: str) -> str:
    return url_for(ROLE_HOME.get(role, "public.login"))


def captain_term_ended(user_id: int) -> bool:
    row = db.session.execute(
        select(User.term_ended_at).where(User.id == user_id)
    ).first()
    return bool(row and row[0] is not None and row[0] <= now())


def _deny_login(json: bool, code=401, message="Not logged in"):
    if json:
        raise ApiError(message, code)
    abort(redirect(url_for("public.login")))


def require_roles(roles, json: bool = False) -> dict:
    user = current_user()
    if not user:
        _deny_login(json)
    if user["role"] not in roles:
        if json:
            raise ApiError("Forbidden", 403)
        abort(redirect(home_for(user["role"])))
    if user["role"] == "captain" and captain_term_ended(int(user["id"])):
        session.clear()
        if json:
            raise ApiError("Your term as Barangay Captain has ended.", 401)
        abort(redirect(url_for("public.login", ended=1)))
    return user


def require_role(role: str, json: bool = False) -> dict:
    return require_roles([role], json)


def require_staff(json: bool = False) -> dict:
    """Admin, staff and captain pages / APIs."""
    return require_roles(["admin", "staff", "captain"], json)


def require_full_access(json: bool = False) -> dict:
    """Administrator only (User & Role Management, activity log...)."""
    return require_roles(["admin"], json)


# --------------------------------------------------------------------------------------
#  CSRF (token in <meta name="csrf"> / hidden field; common.js adds it to every POST)
# --------------------------------------------------------------------------------------


def csrf_token() -> str:
    if not session.get("csrf"):
        session["csrf"] = secrets.token_hex(32)
    return session["csrf"]


def csrf_valid(sent: str) -> bool:
    """True only when a token was issued for this session AND the same one was sent back."""
    mine = session.get("csrf", "") or ""
    return bool(mine) and bool(sent) and hmac.compare_digest(mine, sent)


def csrf_check() -> None:
    sent = request.form.get("csrf", "")
    if not csrf_valid(sent):
        raise ApiError("Invalid security token. Please refresh the page.", 419)


# --------------------------------------------------------------------------------------
#  Permissions  (admin = monitors, staff = work the requests, captain = signs)
# --------------------------------------------------------------------------------------

PERMISSIONS = {
    "approve_documents": "Process document requests (review them and forward to the Captain for signing)",
    "manage_complaints": "Manage complaints and community reports",
    "post_announcements": "Post and delete announcements",
    "view_reports": "View reports and export CSV",
}
STAFF_ONLY_PERMISSIONS = ["approve_documents", "manage_complaints"]


def user_permissions(user=None) -> list:
    user = user or current_user()
    if not user:
        return []
    if user["role"] in ("admin", "captain"):
        return [p for p in PERMISSIONS if p not in STAFF_ONLY_PERMISSIONS]
    if user["role"] != "staff":
        return []
    cache = g.setdefault("_perm_cache", {})
    uid = int(user["id"])
    if uid not in cache:
        cache[uid] = [r[0] for r in db.session.execute(select(UserPermission.permission).where(UserPermission.user_id == uid))]
    return cache[uid]


def has_permission(permission: str, user=None) -> bool:
    return permission in user_permissions(user)


def require_permission(permission: str, json: bool = False) -> dict:
    user = require_staff(json)
    if not has_permission(permission, user):
        if json:
            raise ApiError("You do not have permission to do that. Ask the administrator.", 403)
        abort(redirect(home_for(user["role"])))
    return user


# --------------------------------------------------------------------------------------
#  Personal settings
# --------------------------------------------------------------------------------------

SETTING_DEFAULTS = {
    "theme": "light",
    "font_size": "medium",
    "density": "comfortable",
    "sidebar_collapsed": 0,
    "date_format": "mdy",
    "time_format": "12h",
    "default_page": "dashboard",
    "page_size": 10,
    "notify_announcements": 1,
    "notify_requests": 1,
    "session_timeout": 30,
}
SETTING_CHOICES = {
    "theme": ["light", "dark", "auto"],
    "font_size": ["small", "medium", "large"],
    "density": ["compact", "comfortable"],
    "date_format": ["mdy", "dmy", "iso"],
    "time_format": ["12h", "24h"],
    "page_size": [10, 25, 50],
    "session_timeout": [0, 15, 30, 60, 120],
}
SETTING_GROUPS = {
    "appearance": ["theme", "font_size", "density", "sidebar_collapsed"],
    "general": ["date_format", "time_format", "default_page", "page_size"],
    "notifications": ["notify_announcements", "notify_requests"],
    "security": ["session_timeout"],
}


def get_user_settings(user_id=None) -> dict:
    if user_id is None:
        user_id = int((current_user() or {}).get("id") or 0)
    cache = g.setdefault("_settings_cache", {})
    if user_id in cache:
        return cache[user_id]
    settings = dict(SETTING_DEFAULTS)
    if user_id > 0:
        try:
            row = db.session.get(UserSetting, user_id)
            if row:
                for k in SETTING_DEFAULTS:
                    settings[k] = getattr(row, k)
        except Exception:  # settings are cosmetic: fall back to defaults
            db.session.rollback()
    cache[user_id] = settings
    return settings


def wants_notification(user_id: int, channel: str) -> bool:
    column = {"requests": "notify_requests", "announcements": "notify_announcements"}.get(channel)
    if column is None:
        return True
    row = db.session.get(UserSetting, user_id)
    return True if row is None else int(getattr(row, column)) == 1


def store_settings(user_id: int, values: dict) -> None:
    if not values:
        return
    row = db.session.get(UserSetting, user_id)
    if row is None:
        row = UserSetting(user_id=user_id)
        db.session.add(row)
    for k, v in values.items():
        setattr(row, k, v)
    db.session.commit()


# --------------------------------------------------------------------------------------
#  Notifications, tracking numbers, activity log
# --------------------------------------------------------------------------------------


def add_notification(user_id: int, title: str, message: str, type_: str = "info", channel: str = "") -> None:
    """Add a notification. ``channel`` marks it as optional (skipped when the user turned it off in Settings)."""
    if channel and not wants_notification(user_id, channel):
        return
    db.session.add(Notification(user_id=user_id, title=title[:120], message=message[:255], type=type_))


def _notify_users(user_ids, title, message, type_):
    for uid in user_ids:
        db.session.add(Notification(user_id=uid, title=title[:120], message=message[:255], type=type_))


def notify_role(role: str, title: str, message: str, type_: str = "info") -> None:
    q = select(User.id).where(User.role == role)
    if role == "captain":  # only the serving captain
        q = q.where(or_(User.term_ended_at.is_(None), User.term_ended_at > now()))
    _notify_users([r[0] for r in db.session.execute(q)], title, message, type_)


def notify_staff(title: str, message: str, type_: str = "info") -> None:
    ids = [r[0] for r in db.session.execute(select(User.id).where(User.role.in_(["admin", "staff"])))]
    _notify_users(ids, title, message, type_)


def unread_count(user_id: int) -> int:
    return db.session.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.is_read == 0)
    ) or 0


def latest_notifications(user_id: int, limit: int = 5) -> list:
    res = db.session.execute(
        select(Notification.title, Notification.message, Notification.type, Notification.created_at)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(max(1, limit))
    )
    return rows(res)


def next_tracking_no(category: str) -> str:
    prefix = f"{category_prefix(category)}-{now().year}-"
    existing = db.session.execute(select(Transaction.tracking_no).where(Transaction.tracking_no.like(prefix + "%"))).all()
    biggest = 0
    for (t,) in existing:
        tail = t.rsplit("-", 1)[-1]
        if tail.isdigit():
            biggest = max(biggest, int(tail))
    return f"{prefix}{biggest + 1:05d}"


def log_activity(action: str, detail: str = "", user=None, commit: bool = True) -> None:
    """Record something that happened. Never raises: logging must not break the action that was logged."""
    try:
        user = user if user is not None else current_user()
        db.session.add(ActivityLog(
            user_id=(user or {}).get("id"),
            username=str((user or {}).get("username", ""))[:50],
            action=action[:60], detail=detail[:255],
            ip=(request.remote_addr or "")[:45],
        ))
        if commit:
            db.session.commit()
    except Exception:
        db.session.rollback()


# --------------------------------------------------------------------------------------
#  Profile photo
# --------------------------------------------------------------------------------------


def avatar_dir() -> Path:
    d = Path(current_app.config["UPLOAD_FOLDER"]) / "avatars"
    d.mkdir(parents=True, exist_ok=True)
    return d


def avatar_url(user_id=None) -> str:
    user_id = user_id if user_id is not None else int((current_user() or {}).get("id") or 0)
    if not user_id:
        return ""
    cache = g.setdefault("_avatar_cache", {})
    if user_id in cache:
        return cache[user_id]
    url = ""
    try:
        fname = db.session.scalar(select(User.avatar).where(User.id == user_id)) or ""
        path = avatar_dir() / fname
        if fname and re.fullmatch(r"[A-Za-z0-9_.-]+", fname) and path.is_file():
            url = url_for("public.avatar_file", filename=fname, v=int(path.stat().st_mtime))
    except Exception:
        pass
    cache[user_id] = url
    return url


# --------------------------------------------------------------------------------------
#  Captain: term + signature
# --------------------------------------------------------------------------------------


def current_captain():
    row = db.session.execute(
        select(User).where(User.role == "captain", or_(User.term_ended_at.is_(None), User.term_ended_at > now()))
        .order_by(User.id.desc()).limit(1)
    ).scalar()
    return row


def default_signature(name: str) -> str:
    """A neat handwritten-style signature generated from the name (same name = same signature)."""
    name = name.strip() or "Captain"
    seed = [zlib.crc32(name.lower().encode("utf-8")) & 0xFFFFFFFF]

    def rnd() -> float:
        seed[0] = (seed[0] * 1103515245 + 12345) & 0x7FFFFFFF
        return seed[0] / 0x7FFFFFFF

    letters = "".join(c if (c.isalpha() or c.isspace()) else "" for c in name)
    words = letters.split() or [name]
    last = words[-1][:8]
    x = 10.0
    d = f"M{x:.1f} 64"
    h = 48 + rnd() * 14
    d += f" C {x + 8:.1f} {64 - h:.1f}, {x + 36:.1f} {60 - h:.1f}, {x + 30:.1f} 52 S {x + 14:.1f} 78, {x + 44:.1f} 58"
    x += 44
    for ch in last:
        peak = 18 + (ord(ch) % 7) * 5 + rnd() * 6
        w = 15 + rnd() * 9
        d += f" C {x + w * .25:.1f} {58 - peak:.1f}, {x + w * .6:.1f} {58 - peak:.1f}, {x + w * .8:.1f} 58 S {x + w * 1.2:.1f} 66, {x + w * 1.4:.1f} 60"
        x += w * 1.4
    x += 10
    under = f"M10 80 C {x * .35:.1f} {72 + rnd() * 6:.1f}, {x * .7:.1f} {86 - rnd() * 4:.1f}, {x:.1f} {70 + rnd() * 6:.1f}"
    width = int(-(-(x + 14) // 1))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 100">'
        '<g fill="none" stroke="#1b3a8f" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">'
        f'<path d="{d}"/><path d="{under}" stroke-width="2"/></g></svg>'
    )
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def captain_signature(user_id: int) -> str:
    row = db.session.get(User, user_id)
    if not row:
        return ""
    return row.signature if row.signature else default_signature(row.full_name)


def password_hash_of(user_id: int) -> str:
    return db.session.scalar(select(User.password_hash).where(User.id == user_id)) or ""


def db_error_hint(exc: Exception) -> str:
    """Turn a database exception into a plain-language hint (shown on the login / register pages)."""
    text = str(exc)
    if "2003" in text or "Connection refused" in text or "Can't connect" in text:
        return "MySQL is not running (or the host/port in .env is wrong). Start MySQL, then try again."
    if "1045" in text or "Access denied" in text:
        return "MySQL refused the username or password in .env (DB_USER / DB_PASSWORD)."
    if "1049" in text or "Unknown database" in text:
        return "The database does not exist yet. Run: python start.py"
    if "doesn't exist" in text or "no such table" in text.lower() or "1146" in text:
        return "The database tables do not exist yet. Run: python start.py"
    return "Database error: " + text.splitlines()[0][:140]


# --------------------------------------------------------------------------------------
#  Slowing down password guessing
# --------------------------------------------------------------------------------------


def client_ip() -> str:
    return (request.remote_addr or "unknown")[:60]


def attempts_in_window(kind: str, key: str, minutes: int) -> int:
    from sqlalchemy import func
    from .models import LoginAttempt
    since = now() - timedelta(minutes=minutes)
    return int(db.session.scalar(select(func.count()).select_from(LoginAttempt).where(
        LoginAttempt.kind == kind, LoginAttempt.key == key, LoginAttempt.created_at >= since)) or 0)


def record_attempt(kind: str, *keys: str) -> None:
    """Remember a failed attempt (and tidy up rows older than a day)."""
    from sqlalchemy import delete
    from .models import LoginAttempt
    for k in keys:
        db.session.add(LoginAttempt(kind=kind, key=k[:120]))
    db.session.execute(delete(LoginAttempt).where(LoginAttempt.created_at < now() - timedelta(days=1)))
    db.session.commit()


def clear_attempts(kind: str, key: str) -> None:
    from sqlalchemy import delete
    from .models import LoginAttempt
    db.session.execute(delete(LoginAttempt).where(LoginAttempt.kind == kind, LoginAttempt.key == key))
    db.session.commit()
