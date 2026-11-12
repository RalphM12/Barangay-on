"""Barangay-On (Flask).  Application factory."""
from datetime import date, datetime

from flask import Flask, jsonify, request, session
from flask.json.provider import DefaultJSONProvider
from markupsafe import Markup, escape

from config import Config

from .core import ApiError, avatar_url, csrf_token, current_user, get_user_settings, log_activity
from .models import APP_TZ, db, now as local_now


class JSONProvider(DefaultJSONProvider):
    """Dates leave the API as 'YYYY-MM-DD HH:MM:SS' (what the JavaScript expects) and keys keep their order."""
    sort_keys = False

    @staticmethod
    def default(o):
        if isinstance(o, datetime):
            return o.strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(o, date):
            return o.strftime("%Y-%m-%d")
        return DefaultJSONProvider.default(o)


def create_app(config_object=Config):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object)
    app.json = JSONProvider(app)
    db.init_app(app)

    from .api import bp as api_bp
    from .pages import register_pages
    from .public import bp as public_bp

    app.register_blueprint(public_bp)
    app.register_blueprint(api_bp)
    register_pages(app)

    # ---------------------------------------------------------------- errors
    @app.errorhandler(ApiError)
    def _api_error(err):
        return jsonify({"error": err.message, **err.extra}), err.code

    @app.errorhandler(413)
    def _too_large(_e):
        if request.path.startswith("/api/"):
            return jsonify({"error": "That file is too large."}), 413
        return "That file is too large.", 413

    @app.errorhandler(Exception)
    def _unexpected(err):
        from werkzeug.exceptions import HTTPException
        if isinstance(err, HTTPException):
            return err
        db.session.rollback()
        app.logger.exception("Unhandled error")
        if request.path.startswith("/api/"):
            return jsonify({"error": "Something went wrong. Please try again."}), 500
        raise err

    # ---------------------------------------------------------------- per request
    @app.before_request
    def _session_timeout():
        """Auto logout after inactivity (Settings > Account & Security > Session timeout)."""
        u = session.get("user")
        if not u or request.endpoint == "static":
            return
        mins = int(get_user_settings(int(u["id"])).get("session_timeout") or 0)
        now_ts = int(datetime.now().timestamp())
        last = session.get("last_activity")
        if mins > 0 and last and now_ts - int(last) > mins * 60:
            log_activity("Session timed out", f"Logged out after {mins} minutes of inactivity", u)
            session.pop("user", None)
            session.pop("last_activity", None)
            return
        session["last_activity"] = now_ts

    @app.after_request
    def _headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        if request.path.startswith("/api/") or session.get("user"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    # ---------------------------------------------------------------- templates
    @app.context_processor
    def _globals():
        return {"csrf_token": csrf_token, "current_user": current_user, "today": date.today(), "year": date.today().year}

    @app.template_global()
    def static_v(path):
        """URL of a static file with ?v=<file time> so browsers always load the newest CSS / JS."""
        import os
        from flask import url_for
        full = os.path.join(app.static_folder, path)
        v = f"?v={int(os.path.getmtime(full))}" if os.path.isfile(full) else ""
        return url_for("static", filename=path) + v

    @app.template_filter("mdy")
    def _mdy(d):
        """Oct 29, 2026 (portable: no %-d, which Windows does not support)."""
        return f"{d.strftime('%b')} {d.day}, {d.year}" if d else ""

    @app.template_global()
    def system_info():
        import platform, time
        from flask import __version__ as flask_version
        from sqlalchemy import func, select
        from .models import User
        try:
            users = dict(db.session.execute(select(User.role, func.count()).group_by(User.role)).all())
            dbinfo = f"Connected ({db.engine.dialect.name})"
        except Exception:
            db.session.rollback()
            users, dbinfo = {}, "Not reachable"
        return {"framework": f"Flask {flask_version}", "database": dbinfo, "python": platform.python_version(),
                "time": local_now().strftime("%b %d, %Y %I:%M %p"), "tz": getattr(APP_TZ, "key", None) or str(APP_TZ), "users": users}

    from .nav import notifications_url, profile_url, ui_icon, settings_sections, nav_items
    app.jinja_env.globals.update(
        ui_icon=ui_icon, notifications_url=notifications_url, profile_url=profile_url,
        settings_sections=settings_sections, nav_items=nav_items,
    )

    @app.template_global()
    def prefs_attrs():
        """Attributes for <html> so the saved appearance is applied before the page paints."""
        s = get_user_settings()
        av = avatar_url()
        out = (f' data-avatar="{escape(av)}"' if av else "")
        out += (f' data-theme="{escape(s["theme"])}" data-font="{escape(s["font_size"])}" data-density="{escape(s["density"])}"'
                f' data-sbpref="{"collapsed" if s["sidebar_collapsed"] else "expanded"}"'
                f' data-datefmt="{escape(s["date_format"])}" data-timefmt="{escape(s["time_format"])}" data-pagesize="{int(s["page_size"])}"')
        return Markup(out)

    # Bring an older database (e.g. the original PHP tables) up to date: adds any missing columns, keeps all data
    with app.app_context():
        try:
            from .migrate import upgrade_schema
            added = upgrade_schema()
            if added:
                print(" * Database upgraded, added: " + ", ".join(added))
        except Exception as exc:  # database down etc.: the pages show a readable message instead
            app.logger.warning("Schema check skipped: %s", str(exc).splitlines()[0][:160])

    # Say clearly which database is in use (the most common "data is not saved" cause is looking at the wrong one)
    with app.app_context():
        url = db.engine.url
    where = f"{url.drivername.split('+')[0]} database '{url.database}'" + (f" on {url.host}" if url.host else "")
    app.logger.warning("Barangay-On is using the %s", where)
    print(f" * Barangay-On database: {where}")

    # ---------------------------------------------------------------- CLI
    from .seed import register_cli
    register_cli(app)
    return app
