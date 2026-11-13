import io
import re

from sqlalchemy import select

from app.models import Resident, db


def _register(client, **extra):
    page = client.get("/register").get_data(as_text=True)
    token = re.search(r'name="csrf" value="([0-9a-f]+)"', page).group(1)
    data = dict(csrf=token, first_name="Zelda", last_name="Quimpo", address="Purok 1", birthdate="1999-01-01", sex="Female",
                civil_status="Single", contact_no="09171234567", username="ana.cruz", password="river-lamp-kitchen-42",
                confirm_password="river-lamp-kitchen-42", privacy_consent="1")
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGB", (20, 20), "white").save(buf, "PNG"); buf.seek(0)
    data.update(occupation="Teacher", id_proof=(buf, "id.png"))
    data.update(extra)
    return client.post("/register", data=data, content_type="multipart/form-data")


def test_registration_saves_the_middle_name(app, client):
    assert _register(client, middle_name="Santos").status_code == 302
    with app.app_context():
        r = db.session.execute(select(Resident).where(Resident.first_name == "Zelda")).scalar()
        assert r.middle_name == "Santos"


def test_middle_name_is_optional(app, client):
    assert _register(client).status_code == 302
    with app.app_context():
        r = db.session.execute(select(Resident).where(Resident.first_name == "Zelda")).scalar()
        assert (r.middle_name or "") == ""


def test_middle_name_too_long_is_refused(client):
    assert b"too long" in _register(client, middle_name="x" * 61).data



def test_registration_extras(app, client):
    page = client.get("/register").get_data(as_text=True)
    assert 'name="suffix"' in page and 'name="occupation"' in page and 'name="id_proof"' in page
    assert _register(client, suffix="Jr.", occupation="Farmer").status_code == 302
    with app.app_context():
        r = db.session.execute(select(Resident).where(Resident.first_name == "Zelda")).scalar()
        assert r.suffix == "Jr." and r.occupation == "Farmer" and r.id_proof.endswith(".png")
        name = r.id_proof
    assert client.get("/resident-id/" + name).status_code in (302, 401, 403)   # not public


def test_registration_requires_id(client):
    r = _register(client, id_proof=(io.BytesIO(b"not an image"), "x.png"))
    assert r.status_code == 200 and "JPG, PNG, WEBP or PDF" in r.get_data(as_text=True)
