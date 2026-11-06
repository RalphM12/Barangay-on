"""Public pages: home, login, register, logout (+ serving uploaded profile photos)."""
import re
from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, redirect, render_template, request, send_from_directory, session, url_for
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .core import (
    add_notification, avatar_dir, db_error_hint, csrf_token, current_user, hash_password, home_for, log_activity, notify_staff,
    verify_password, ROLE_HOME,
)
from .models import Announcement, Resident, Service, User, db, now
from .nav import default_page_url

bp = Blueprint("public", __name__)


def mural(c):
    """Generated hero artwork (replace it with your own photos at static/img/hero/1.jpg, 2.jpg, 3.jpg)."""
    from markupsafe import Markup
    shapes = [
        ("circle", "440,260,190", 0), ("poly", "0,0 330,0 260,380 0,520", 1), ("poly", "620,0 1000,0 840,330 560,420", 3),
        ("poly", "1000,0 1600,0 1600,300 1180,260", 1), ("poly", "260,380 640,300 760,640 360,900 120,700", 2),
        ("poly", "840,330 1220,420 1160,760 780,640", 4), ("poly", "1180,260 1600,300 1600,620 1300,560", 6),
        ("poly", "0,520 260,380 120,700 0,900", 5), ("poly", "360,900 760,640 1000,900", 0),
        ("poly", "1160,760 1300,560 1600,620 1600,900 1240,900", 3), ("circle", "1480,720,140", 5),
    ]
    out = ('<svg class="mural" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
           '<rect width="1600" height="900" fill="#555b66"/>')
    for kind, d, i in shapes:
        fill = c[i % len(c)]
        if kind == "circle":
            cx, cy, r = d.split(",")
            out += f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
        else:
            out += f'<polygon points="{d}" fill="{fill}"/>'
    out += '<path d="M0 640C300 560 420 820 800 700S1300 560 1600 760" fill="none" stroke="#1d2433" stroke-opacity=".55" stroke-width="5"/></svg>'
    return Markup(out)

CIVIL_OPTIONS = ["Single", "Married", "Widowed", "Separated"]


@bp.get("/uploads/avatars/<path:filename>")
def avatar_file(filename):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", filename):
        return ("Not found", 404)
    return send_from_directory(avatar_dir(), filename, max_age=3600)


def _latest_announcements(n=3):
    try:
        return db.session.execute(select(Announcement).order_by(Announcement.created_at.desc(), Announcement.id.desc()).limit(n)).scalars().all()
    except Exception:
        db.session.rollback()
        return []


@bp.get("/")
def index():
    user = current_user()
    if user:
        return redirect(default_page_url(user))
    services = {"document": [], "complaint": [], "report": []}
    try:
        for s in db.session.execute(select(Service).order_by(Service.category, Service.name)).scalars():
            services[s.category].append(s.name)
    except Exception:
        db.session.rollback()
    import os
    gallery_dir = os.path.join(current_app.static_folder, "img", "gallery")
    gallery = []
    if os.path.isdir(gallery_dir):
        gallery = [url_for("static", filename=f"img/gallery/{f}") for f in sorted(os.listdir(gallery_dir))
                   if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
    cfg = current_app.config
    palettes = [
        ["#7a1f5c", "#2f6fb0", "#c18a2b", "#6a4a9c", "#8a8f96", "#3f7f4f", "#b53b45"],
        ["#2f6fb0", "#c18a2b", "#7a1f5c", "#3f7f4f", "#b53b45", "#6a4a9c", "#8a8f96"],
        ["#b53b45", "#6a4a9c", "#2f6fb0", "#8a8f96", "#c18a2b", "#7a1f5c", "#3f7f4f"],
    ]
    return render_template(
        "index.html", murals=[mural(p) for p in palettes], services=services, announcements=_latest_announcements(), gallery=gallery,
        barangay=cfg["BARANGAY"], about=cfg["ABOUT"], hotlines=cfg["HOTLINES"], office_hours=cfg["OFFICE_HOURS"], email=cfg["EMAIL"],
    )


@bp.route("/login", methods=["GET", "POST"])
def login():
    existing = current_user()
    if existing:
        return redirect(default_page_url(existing))
    error = "Your term as Barangay Captain has ended, so you were signed out. Please contact the administrator." if request.args.get("ended") else ""
    username = (request.args.get("u") or "").strip()

    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password", "")
        if username == "" or password == "":
            error = "Please enter your username and password."
        else:
            try:
                row = db.session.execute(select(User).where(User.username == username).limit(1)).scalar()
                term_over = bool(row and row.term_ended_at and row.term_ended_at <= now())
                good = bool(row and verify_password(password, row.password_hash))
                if row and row.role == "captain" and term_over and good:
                    error = "Your term as Barangay Captain has ended, so this account can no longer sign in. Please contact the administrator."
                elif good:
                    session.clear()
                    session.permanent = False
                    session["user"] = {"id": row.id, "username": row.username, "full_name": row.full_name,
                                       "position": row.position, "role": row.role}
                    session["last_activity"] = int(datetime.now().timestamp())
                    log_activity("Login successful", f"You logged in from {request.remote_addr or 'unknown'}", session["user"])
                    return redirect(default_page_url(session["user"]))
                if row and error == "":
                    log_activity("Login failed", "Invalid password attempt",
                                 {"id": row.id, "username": row.username})
                if error == "":
                    error = "Invalid username or password."
            except Exception as exc:
                db.session.rollback()
                current_app.logger.exception("login failed")
                error = db_error_hint(exc)
    return render_template("login.html", error=error, username=username, announcements=_latest_announcements(),
                           registered=bool(request.args.get("registered")))


@bp.get("/logout")
def logout():
    if current_user():
        log_activity("Logout", "Logged out")
    session.clear()
    return redirect(url_for("public.login"))


def _age_from(birthdate: str) -> str:
    try:
        bd = datetime.strptime(birthdate, "%Y-%m-%d").date()
    except ValueError:
        return ""
    if bd > date.today():
        return ""
    t = date.today()
    return str(t.year - bd.year - ((t.month, t.day) < (bd.month, bd.day)))


@bp.route("/register", methods=["GET", "POST"])
def register():
    existing = current_user()
    if existing:
        return redirect(home_for(existing["role"]))
    errors = {}
    old = {k: "" for k in ("first_name", "last_name", "address", "birthdate", "civil_status", "contact_no", "username")}

    if request.method == "POST":
        for k in old:
            old[k] = (request.form.get(k) or "").strip()
        password, confirm = request.form.get("password", ""), request.form.get("confirm_password", "")
        import hmac
        if not hmac.compare_digest(session.get("csrf", "") or "", request.form.get("csrf", "")):
            errors["form"] = "Your session expired. Please try again."
        if old["first_name"] == "" or len(old["first_name"]) > 60:
            errors["first_name"] = "Enter your first name (up to 60 characters)."
        if old["last_name"] == "" or len(old["last_name"]) > 60:
            errors["last_name"] = "Enter your last name (up to 60 characters)."
        if old["address"] == "" or len(old["address"]) > 150:
            errors["address"] = "Enter your address, such as your purok and street."
        bd = None
        try:
            bd = datetime.strptime(old["birthdate"], "%Y-%m-%d").date()
            if bd.strftime("%Y-%m-%d") != old["birthdate"] or bd > date.today() or bd < date.today() - timedelta(days=365 * 120 + 30):
                bd = None
        except ValueError:
            bd = None
        if bd is None:
            errors["birthdate"] = "Enter a valid birthday."
        if old["civil_status"] not in CIVIL_OPTIONS:
            errors["civil_status"] = "Choose your civil status."
        if not re.fullmatch(r"[0-9]{7,11}", old["contact_no"]):
            errors["contact_no"] = "Enter a valid contact number: digits only, up to 11 digits (e.g., 09171234567)."
        if not re.fullmatch(r"[A-Za-z0-9._]{4,30}", old["username"]):
            errors["username"] = "Use 4 to 30 letters, numbers, dots or underscores."
        if len(password) < 8:
            errors["password"] = "Use at least 8 characters."
        elif password != confirm:
            errors["confirm_password"] = "The passwords do not match."

        if not errors:
            try:
                full_name = f"{old['first_name']} {old['last_name']}"
                u = User(username=old["username"], password_hash=hash_password(password), full_name=full_name,
                         position="Resident", role="resident")
                db.session.add(u)
                db.session.flush()
                db.session.add(Resident(user_id=u.id, first_name=old["first_name"], last_name=old["last_name"], address=old["address"],
                                        birthdate=bd, civil_status=old["civil_status"], contact_no=old["contact_no"], status="Pending"))
                db.session.commit()
                notify_staff("New resident registration", f"{full_name} registered online. Review the record on the Residents page.", "info")
                add_notification(u.id, "Welcome to Barangay-On", "Your registration was received. Barangay staff will verify your record.", "success")
                db.session.commit()
                return redirect(url_for("public.login", registered=1, u=old["username"]))
            except IntegrityError:
                db.session.rollback()
                errors["username"] = "That username is taken. Try another one."
            except Exception as exc:
                db.session.rollback()
                current_app.logger.exception("register failed")
                errors["form"] = "Cannot save your registration. " + db_error_hint(exc)
    return render_template("register.html", errors=errors, old=old, civil_options=CIVIL_OPTIONS, csrf=csrf_token(),
                           age=_age_from(old["birthdate"]),
                           bd_min=(date.today() - timedelta(days=365 * 120 + 30)).strftime("%Y-%m-%d"),
                           bd_max=date.today().strftime("%Y-%m-%d"))
