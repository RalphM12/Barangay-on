"""Application configuration.

Everything can be overridden with environment variables (or a ``.env`` file).

Database
--------
* Early development / testing:  SQLite  (the default, file stored in ``instance/``)
* Deployment:                   MySQL   -> set DATABASE_URL, for example
      DATABASE_URL=mysql+pymysql://root:password@localhost/barangay_on?charset=utf8mb4
"""
import os
from pathlib import Path

try:  # optional: load variables from a .env file when python-dotenv is installed
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:  # pragma: no cover
    pass

BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(exist_ok=True)


def _database_url() -> str:
    """DATABASE_URL wins. Otherwise build it from DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
    (special characters in the password are encoded for you). With no settings at all: SQLite."""
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    if os.environ.get("DB_USER"):
        from sqlalchemy.engine import URL
        return URL.create(
            "mysql+pymysql",
            username=os.environ["DB_USER"],
            password=os.environ.get("DB_PASSWORD", ""),
            host=os.environ.get("DB_HOST", "127.0.0.1"),
            port=int(os.environ.get("DB_PORT", "3306")),
            database=os.environ.get("DB_NAME", "barangay_on"),
            query={"charset": "utf8mb4"},
        ).render_as_string(hide_password=False)
    return f"sqlite:///{INSTANCE_DIR / 'barangay_on.db'}"


PRODUCTION = os.environ.get("APP_ENV", "").strip().lower() == "production"


def _secret_key() -> str:
    """SECRET_KEY signs the login cookie. There is no public default any more: with no key set, a random
    one is made for this run (everyone is logged out on restart) and, in production, the app refuses to start."""
    key = os.environ.get("SECRET_KEY", "").strip()
    if key:
        if len(key) < 32 and PRODUCTION:
            raise RuntimeError("SECRET_KEY is too short. Use at least 32 random characters "
                               "(python3 -c \"import secrets; print(secrets.token_hex(32))\").")
        return key
    if PRODUCTION:
        raise RuntimeError("SECRET_KEY is not set. Set it in the host's environment variables "
                           "(python3 -c \"import secrets; print(secrets.token_hex(32))\") before running in production.")
    import secrets
    print(" ! SECRET_KEY is not set: using a temporary random key (fine for testing; set a real one in .env or the host).")
    return secrets.token_hex(32)


class Config:
    SECRET_KEY = _secret_key()
    APP_ENV = "production" if PRODUCTION else "development"
    # Demo accounts (admin/staff/captain/resident, password "password") can only log in when this is switched on,
    # which only happens with `python main.py --demo` on your own computer.
    ALLOW_DEMO_LOGINS = os.environ.get("ALLOW_DEMO_LOGINS", "0") == "1"
    # How many reverse proxies sit in front of the app (Wasmer, nginx...). Needed to see the visitor's real IP.
    TRUSTED_PROXIES = int(os.environ.get("TRUSTED_PROXIES", "1" if PRODUCTION else "0"))
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "1" if PRODUCTION else "0") == "1"

    # Uploads (profile photos). Stored on the server, outside any user-controlled path.
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", str(BASE_DIR / "app" / "static" / "uploads"))
    MAX_CONTENT_LENGTH = 4 * 1024 * 1024  # hard request limit (avatar limit is 2 MB, signature 300 KB)

    JSON_SORT_KEYS = False

    # ---- Edit these to match your barangay (home page) ----
    BARANGAY = "Brgy. Sto Niño, Baliuag City, Bulacan"
    ABOUT = (
        "Barangay-On is the online portal of our barangay. Residents can request certificates and "
        "permits, file complaints and community reports, and follow every request from their own "
        "account, without waiting in line at the barangay hall."
    )
    HOTLINES = [
        ("National Emergency Hotline", "911"),
        ("Barangay Hall", "0917 000 0000"),
        ("Barangay Peace and Order", "0917 000 0001"),
        ("Health Center", "0917 000 0002"),
        ("Fire Station", "0917 000 0003"),
    ]
    OFFICE_HOURS = "Monday to Sunday, 24/7"
    EMAIL = "info@barangay-sample.example"


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SECRET_KEY = "test"
    ALLOW_DEMO_LOGINS = False
