"""Security checks: run with  pytest"""
import pytest

from app.core import password_problem
from app.models import db, LoginAttempt, User
from sqlalchemy import select
from tests.conftest import login


def test_demo_accounts_cannot_log_in_by_default(client):
    r = login(client, "admin", "password")
    assert r.status_code == 200 and b"demo password" in r.data
    assert client.get("/admin/dashboard").status_code in (302, 401, 403)


def test_demo_accounts_work_only_when_switched_on(app, client):
    app.config["ALLOW_DEMO_LOGINS"] = True
    assert login(client, "admin", "password").status_code == 302


def test_real_password_logs_in(app, client):
    from app.core import hash_password
    with app.app_context():
        u = db.session.scalar(select(User).where(User.username == "staff"))
        u.password_hash = hash_password("a-long-real-passphrase")
        db.session.commit()
    assert login(client, "staff", "a-long-real-passphrase").status_code == 302


def test_login_without_csrf_token_is_refused(client):
    r = client.post("/login", data={"username": "staff", "password": "x"})
    assert b"session expired" in r.data


def test_login_is_locked_after_five_failures(client):
    for _ in range(5):
        assert login(client, "staff", "wrong-password-1").status_code == 200
    r = login(client, "staff", "wrong-password-1")
    assert r.status_code == 429 and b"Too many failed attempts" in r.data


def test_failed_logins_are_remembered(app, client):
    login(client, "staff", "wrong-password-1")
    with app.app_context():
        assert db.session.query(LoginAttempt).count() >= 1


def test_unknown_user_gets_the_same_message(client):
    a = login(client, "nobody-here", "whatever-password").get_data(as_text=True)
    b = login(client, "staff", "whatever-password").get_data(as_text=True)
    assert "Invalid username or password." in a and "Invalid username or password." in b


@pytest.mark.parametrize("pw,ok", [("short", False), ("password123", False), ("1234567890123", False),
                                   ("aaaaaaaaaaaa", False), ("river-lamp-kitchen-42", True)])
def test_password_rules(pw, ok):
    assert (password_problem(pw) == "") is ok


def test_cross_site_logout_is_ignored(app, client):
    app.config["ALLOW_DEMO_LOGINS"] = True
    login(client, "admin", "password")
    client.get("/logout", headers={"Sec-Fetch-Site": "cross-site"})
    assert client.get("/admin/dashboard").status_code == 200       # still logged in
    client.get("/logout", headers={"Sec-Fetch-Site": "same-origin"})
    assert client.get("/admin/dashboard").status_code != 200        # now logged out


def test_security_headers(client):
    r = client.get("/")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert "Referrer-Policy" in r.headers


def test_register_requires_privacy_consent_and_strong_password(client):
    page = client.get("/register").get_data(as_text=True)
    import re
    token = re.search(r'name="csrf" value="([0-9a-f]+)"', page).group(1)
    data = dict(csrf=token, first_name="Ana", last_name="Cruz", address="Purok 1", birthdate="1999-01-01", sex="Female",
                civil_status="Single", contact_no="09171234567", username="ana.cruz", password="river-lamp-kitchen-42",
                confirm_password="river-lamp-kitchen-42")
    assert b"privacy notice" in client.post("/register", data=data).data
    data["password"] = data["confirm_password"] = "password123"
    data["privacy_consent"] = "1"
    assert b"too easy to guess" in client.post("/register", data=data).data


def test_resident_cannot_open_admin_api(app, client):
    app.config["ALLOW_DEMO_LOGINS"] = True
    login(client, "resident", "password")
    assert client.get("/api/users").status_code in (401, 403)
    assert client.get("/admin/dashboard").status_code in (302, 401, 403)


def test_production_refuses_to_start_without_secret_key(monkeypatch):
    import importlib
    import config
    try:  # config.py reads your own .env file, which may contain a SECRET_KEY: ignore it for this test
        import dotenv
        monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **k: None)
    except ImportError:
        pass
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        importlib.reload(config)
    monkeypatch.delenv("APP_ENV")
    importlib.reload(config)
