import re

from sqlalchemy import select

from app.models import Resident, db


def _register(client, **extra):
    page = client.get("/register").get_data(as_text=True)
    token = re.search(r'name="csrf" value="([0-9a-f]+)"', page).group(1)
    data = dict(csrf=token, first_name="Ana", last_name="Cruz", address="Purok 1", birthdate="1999-01-01", sex="Female",
                civil_status="Single", contact_no="09171234567", username="ana.cruz", password="river-lamp-kitchen-42",
                confirm_password="river-lamp-kitchen-42", privacy_consent="1")
    data.update(extra)
    return client.post("/register", data=data)


def test_registration_saves_the_middle_name(app, client):
    assert _register(client, middle_name="Santos").status_code == 302
    with app.app_context():
        r = db.session.execute(select(Resident).where(Resident.first_name == "Ana")).scalar()
        assert r.middle_name == "Santos"


def test_middle_name_is_optional(app, client):
    assert _register(client).status_code == 302
    with app.app_context():
        r = db.session.execute(select(Resident).where(Resident.first_name == "Ana")).scalar()
        assert (r.middle_name or "") == ""


def test_middle_name_too_long_is_refused(client):
    assert b"too long" in _register(client, middle_name="x" * 61).data
