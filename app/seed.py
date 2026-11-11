"""Database setup commands + sample data.

    flask --app wsgi init-db          create the tables (keeps existing data)
    flask --app wsgi init-db --reset  DROP everything, recreate and load the sample data
    flask --app wsgi seed             load the sample data into an empty database
    flask --app wsgi create-admin     create an administrator account

Demo logins (password for all is:  password)
    admin / staff / captain / resident
"""
from datetime import timedelta

import click
from sqlalchemy import select

from .core import hash_password
from .models import (
    Announcement, Notification, Resident, Service, Transaction, User, UserPermission, db, now,
)

from .core import DEMO_PASSWORD_HASH as DEMO_HASH  # bcrypt of the word "password": demo accounts only


def load_sample_data():
    n = now()
    ago = lambda **kw: n - timedelta(**kw)  # noqa: E731
    yr = n.year

    users = [
        (1, "admin", "Maria Santos", "Administrator", "admin"),
        (2, "captain", "Roberto Dela Cruz", "Barangay Captain", "captain"),
        (3, "resident", "Justine Agulto", "Resident", "resident"),
        (4, "staff", "Ana Reyes", "Barangay Staff", "staff"),
    ]
    for uid, un, fn, pos, role in users:
        db.session.add(User(id=uid, username=un, password_hash=DEMO_HASH, full_name=fn, position=pos, role=role))
    for p in ("approve_documents", "manage_complaints", "post_announcements"):
        db.session.add(UserPermission(user_id=4, permission=p))

    db.session.flush()  # MySQL enforces foreign keys: users must exist before the rows that point to them

    people = [
        (1, 3, "Justine", "Agulto", "Purok 1, Brgy. Sto Niño", "Registered"),
        (2, None, "Juan", "Dela Cruz", "Purok 2, Brgy. Sto Niño", "Registered"),
        (3, None, "Maria", "Santos", "Purok 3, Brgy. Sto Niño", "Registered"),
        (4, None, "Carlos", "Reyes", "Purok 1, Brgy. Sto Niño", "Registered"),
        (5, None, "Ana", "Lopez", "Purok 4, Brgy. Sto Niño", "Registered"),
        (6, None, "Pedro", "Ramos", "Purok 5, Brgy. Sto Niño", "Registered"),
        (7, None, "Liza", "Mendoza", "Purok 2, Brgy. Sto Niño", "Registered"),
        (8, None, "Jose", "Garcia", "Purok 3, Brgy. Sto Niño", "Registered"),
        (9, None, "Rosa", "Bautista", "Purok 4, Brgy. Sto Niño", "Registered"),
        (10, None, "Mark", "Villanueva", "Purok 5, Brgy. Sto Niño", "Registered"),
        (11, None, "Grace", "Navarro", "Purok 1, Brgy. Sto Niño", "Registered"),
        (12, None, "Noel", "Castillo", "Purok 2, Brgy. Sto Niño", "Pending"),
    ]
    for rid, uid, fn, ln, addr, st in people:
        db.session.add(Resident(id=rid, user_id=uid, first_name=fn, last_name=ln, address=addr,
                                contact_no=f"091700000{rid:02d}", status=st))

    db.session.flush()

    services = [
        (1, "Barangay Clearance", "document"), (2, "Certificate of Residency", "document"),
        (3, "Certificate of Indigency", "document"), (4, "Business Permit", "document"),
        (5, "Noise Complaint", "complaint"), (6, "Neighbor Dispute", "complaint"),
        (7, "Missing Person", "report"), (8, "Suspicious Activity", "report"), (9, "Broken Streetlight", "report"),
        (10, "Others", "complaint"), (11, "Others", "report"),
    ]
    for sid, name, cat in services:
        db.session.add(Service(id=sid, name=name, category=cat))
    db.session.flush()

    # (tracking, resident, service, status, details, age)
    tx = [
        ("BRG", 126, 1, 1, "Pending", "Needed for job application", dict(minutes=30)),
        ("BRG", 101, 1, 3, "Pending", "For scholarship", dict(days=2)),
        ("CMP", 3, 1, 6, "Under Review", "Boundary issue", dict(days=3)),
        ("BRG", 90, 1, 2, "Approved", "Proof of residency", dict(days=10)),
        ("BRG", 70, 1, 1, "Approved", "Employment", dict(days=20)),
        ("RPT", 2, 1, 9, "Resolved", "Streetlight on Purok 1", dict(days=15)),
        ("BRG", 125, 2, 1, "Pending", None, dict(hours=1)),
        ("BRG", 124, 7, 1, "Pending", None, dict(hours=2)),
        ("BRG", 127, 9, 1, "Pending", None, dict(hours=3)),
        ("CMP", 14, 3, 5, "Under Review", "Loud karaoke at night", dict(days=1)),
        ("BRG", 123, 8, 3, "Pending", None, dict(days=1)),
        ("BRG", 122, 9, 4, "Approved", None, dict(days=2)),
        ("BRG", 121, 10, 2, "Approved", None, dict(days=2)),
        ("RPT", 8, 4, 7, "Resolved", "Found safe", dict(days=3)),
        ("CMP", 13, 11, 6, "Under Review", None, dict(days=3)),
        ("RPT", 5, 6, 9, "Under Review", None, dict(days=3)),
        ("CMP", 12, 12, 5, "Resolved", None, dict(days=4)),
        ("RPT", 7, 2, 9, "Under Review", None, dict(days=4)),
        ("BRG", 120, 5, 2, "Pending", None, dict(days=5)),
        ("BRG", 119, 3, 1, "Approved", None, dict(days=5)),
        ("BRG", 118, 4, 3, "Approved", None, dict(days=6)),
        ("BRG", 117, 5, 1, "Approved", None, dict(days=6)),
        ("RPT", 6, 6, 8, "Under Review", None, dict(days=6)),
        ("BRG", 110, 7, 2, "Approved", None, dict(days=12)),
        ("BRG", 100, 8, 1, "Approved", None, dict(days=35)),
        ("BRG", 99, 9, 1, "Approved", None, dict(days=38)),
        ("CMP", 9, 3, 5, "Resolved", None, dict(days=45)),
        ("BRG", 80, 2, 3, "Approved", None, dict(days=65)),
        ("BRG", 79, 4, 1, "Approved", None, dict(days=70)),
        ("RPT", 4, 5, 9, "Resolved", None, dict(days=75)),
        ("BRG", 60, 6, 2, "Approved", None, dict(days=100)),
        ("CMP", 6, 7, 6, "Resolved", None, dict(days=105)),
        ("BRG", 50, 8, 1, "Approved", None, dict(days=130)),
        ("BRG", 40, 9, 4, "Approved", None, dict(days=160)),
    ]
    for prefix, num, res_id, svc_id, status, details, age in tx:
        created = ago(**age)
        t = Transaction(tracking_no=f"{prefix}-{yr}-{num:05d}", resident_id=res_id, service_id=svc_id, status=status,
                        details=details, created_at=created, updated_at=created)
        if status == "Approved":
            # sample approved documents were all forwarded, signed and released
            t.endorsed_at, t.endorsed_by = created + timedelta(minutes=20), 4
            t.released_at = created + timedelta(hours=1)
            t.signed_by, t.signed_at = 2, t.released_at
            t.status, t.approved_at, t.approved_by, t.released_by = "Released", t.released_at, 2, 2
        db.session.add(t)
    db.session.flush()

    # some documents were approved by staff (so they went to the captain automatically) and wait for the signature
    for num in (101, 123, 120):
        t = db.session.execute(select(Transaction).where(Transaction.tracking_no == f"BRG-{yr}-{num:05d}")).scalar()
        t.status, t.approved_at, t.approved_by = "Approved", n - timedelta(minutes=20), 4
        t.endorsed_at, t.endorsed_by = n - timedelta(minutes=20), 4
        if num == 120:  # one is already signed by the captain and waits for staff to release it
            t.signed_by, t.signed_at = 2, n - timedelta(minutes=5)

    notes = [
        (1, "New document request", "Barangay Clearance (BRG-%d-00125) is pending approval." % yr, "info", dict(hours=2)),
        (1, "New Complaint", "Noise Complaint (CMP-%d-00014) is under review." % yr, "info", dict(hours=4)),
        (1, "Community Report Update", "Missing Person (RPT-%d-00008) has been marked as resolved." % yr, "warning", dict(hours=6)),
        (1, "New Resident Registration", "A new resident has registered in the system.", "info", dict(days=1)),
        (1, "System Announcement", "System maintenance is scheduled this weekend (9:00 PM - 11:00 PM).", "alert", dict(days=1)),
        (2, "Documents waiting for signature", "Several document requests are waiting for your signature.", "warning", dict(hours=1)),
        (3, "Request received", "Your Barangay Clearance request is now being processed.", "info", dict(minutes=20)),
        (3, "Complaint under review", "Your complaint (CMP-%d-00003) is under review." % yr, "info", dict(days=1)),
        (3, "Document approved", "Your Certificate of Residency has been approved and released.", "success", dict(days=9)),
    ]
    for uid, title, msg, typ, age in notes:
        db.session.add(Notification(user_id=uid, title=title, message=msg, type=typ, created_at=ago(**age)))

    db.session.add(Announcement(posted_by=1, title="Barangay Assembly", created_at=ago(days=2),
                                body="All residents are invited to the barangay assembly this coming Saturday at the Barangay Hall."))
    db.session.add(Announcement(posted_by=4, title="Clean-up Drive", created_at=ago(days=8),
                                body="Join our monthly clean-up drive. Gloves and bags will be provided."))
    db.session.commit()


BASE_SERVICES = [
    ("Barangay Clearance", "document"), ("Certificate of Residency", "document"),
    ("Certificate of Indigency", "document"), ("Business Permit", "document"),
    ("Noise Complaint", "complaint"), ("Neighbor Dispute", "complaint"),
    ("Missing Person", "report"), ("Suspicious Activity", "report"), ("Broken Streetlight", "report"),
    ("Others", "complaint"), ("Others", "report"),
]


def bootstrap_from_env():
    """For a real (non-demo) site. On an empty database add the service list, and create the first administrator
    from the ADMIN_USERNAME / ADMIN_PASSWORD (/ ADMIN_NAME) environment variables. Does nothing when they are not set,
    or when that username already exists. Remove ADMIN_PASSWORD from the host once you can log in."""
    import logging
    import os
    log = logging.getLogger("barangay-on")
    try:
        if not db.session.scalar(select(Service.id).limit(1)) and not db.session.scalar(select(User.id).limit(1)):
            for name, cat in BASE_SERVICES:
                db.session.add(Service(name=name, category=cat))
            db.session.commit()
        username = os.environ.get("ADMIN_USERNAME", "").strip()
        password = os.environ.get("ADMIN_PASSWORD", "")
        if not username or not password:
            return
        if db.session.scalar(select(User.id).where(User.username == username)):
            return
        from .core import password_problem
        problem = password_problem(password, username)
        if problem:
            log.warning("ADMIN_PASSWORD was not used: %s", problem)
            return
        db.session.add(User(username=username, password_hash=hash_password(password),
                            full_name=os.environ.get("ADMIN_NAME", "").strip() or "Administrator",
                            position="Administrator", role="admin"))
        db.session.commit()
        log.warning("Administrator account '%s' created from ADMIN_USERNAME / ADMIN_PASSWORD. "
                    "Remove ADMIN_PASSWORD from the environment now.", username)
    except Exception as exc:
        db.session.rollback()
        log.warning("First-run setup skipped: %s", str(exc).splitlines()[0][:160])


def _create_mysql_database_if_missing():
    """With MySQL, create the (empty) database named in DATABASE_URL when it does not exist yet."""
    from sqlalchemy import create_engine, text
    url = db.engine.url
    if not url.drivername.startswith("mysql") or not url.database:
        return
    try:
        db.engine.connect().close()
    except Exception:
        admin = create_engine(url.set(database="mysql"))
        with admin.begin() as conn:
            conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{url.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        db.engine.dispose()


def register_cli(app):
    @app.cli.command("init-db")
    @click.option("--reset", is_flag=True, help="Drop every table first and load the sample data.")
    def init_db(reset):
        """Create the database tables."""
        _create_mysql_database_if_missing()
        if reset:
            db.drop_all()
        from .migrate import upgrade_schema
        added = upgrade_schema()
        if added:
            click.echo("Database upgraded, added columns: " + ", ".join(added))
        if reset:
            load_sample_data()
            click.echo("Database reset and sample data loaded. Demo logins: admin / staff / captain / resident (password: password)")
        else:
            click.echo("Tables created.")

    @app.cli.command("db-info")
    def db_info():
        """Show which database the app is connected to and how many rows each table has."""
        from sqlalchemy import func
        url = db.engine.url
        click.echo(f"Connected to: {url.render_as_string(hide_password=True)}")
        for model in (User, Resident, Transaction, Announcement):
            try:
                click.echo(f"  {model.__tablename__:14} {db.session.scalar(select(func.count()).select_from(model))} rows")
            except Exception as e:
                click.echo(f"  {model.__tablename__:14} ERROR {str(e).splitlines()[0][:90]}")

    @app.cli.command("seed")
    def seed():
        """Load the sample data into an empty database."""
        db.create_all()
        if db.session.scalar(select(User.id).limit(1)):
            click.echo("The database already has users - nothing was loaded. Use init-db --reset to start over.")
            return
        load_sample_data()
        click.echo("Sample data loaded.")

    @app.cli.command("set-password")
    @click.option("--username", prompt=True)
    @click.password_option()
    def set_password(username, password):
        """Set a new password for any account (use this to replace a demo password)."""
        from .core import password_problem
        row = db.session.scalar(select(User).where(User.username == username))
        if not row:
            raise click.ClickException("No such username.")
        problem = password_problem(password, username)
        if problem:
            raise click.ClickException(problem)
        row.password_hash = hash_password(password)
        db.session.commit()
        click.echo("Password updated.")

    @app.cli.command("create-admin")
    @click.option("--username", prompt=True)
    @click.option("--name", prompt="Full name")
    @click.password_option()
    def create_admin(username, name, password):
        """Create an administrator account."""
        if db.session.scalar(select(User.id).where(User.username == username)):
            raise click.ClickException("That username already exists.")
        db.create_all()
        db.session.add(User(username=username, password_hash=hash_password(password), full_name=name,
                            position="Administrator", role="admin"))
        db.session.commit()
        click.echo("Administrator created.")
