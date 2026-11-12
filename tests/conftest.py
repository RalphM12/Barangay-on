import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.models import db  # noqa: E402
from app.seed import load_sample_data  # noqa: E402
from config import TestConfig  # noqa: E402


@pytest.fixture()
def app():
    class Cfg(TestConfig):
        pass
    app = create_app(Cfg)
    with app.app_context():
        db.drop_all()
        db.create_all()
        load_sample_data()          # demo accounts (password "password") exist in the database...
    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, username, password):
    """Open the login page (gets the CSRF token), then post the form."""
    page = client.get("/login").get_data(as_text=True)
    token = re.search(r'name="csrf" value="([0-9a-f]+)"', page).group(1)
    return client.post("/login", data={"username": username, "password": password, "csrf": token})
