#!/usr/bin/env python3
"""One command to get Barangay-On running with MySQL:

    python main.py --demo      check MySQL -> create database + tables -> load DEMO data and demo logins (your own computer only)
    python main.py             same, but NO demo data: set ADMIN_USERNAME / ADMIN_PASSWORD to create the first administrator
    python main.py --sqlite    skip MySQL and use a local SQLite file (testing only, includes demo data)
    python main.py --reset     ERASE everything and reload the demo data
    python main.py --port 5050

Edit the DB_* lines in the .env file next to this script if your MySQL user / password / port differ.
"""
import argparse
import os
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--sqlite", action="store_true", help="use SQLite instead of MySQL")
parser.add_argument("--reset", action="store_true", help="erase all data and reload the demo data")
parser.add_argument("--demo", action="store_true", help="load demo data and allow the demo logins (local testing only)")
parser.add_argument("--port", type=int, default=5000)
args = parser.parse_args()

if args.demo or args.sqlite or args.reset:
    os.environ["ALLOW_DEMO_LOGINS"] = "1"  # demo accounts can only log in when you asked for demo mode

if args.sqlite:
    for k in ("DATABASE_URL", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_NAME"):
        os.environ[k] = ""
    os.environ["DB_USER"] = ""

try:
    from sqlalchemy import create_engine, select, text
    from sqlalchemy.engine import make_url
    from config import Config
except ImportError as e:  # packages not installed
    sys.exit(f"\nA package is missing ({e}).\nRun:  pip install -r requirements.txt\n")

url = make_url(Config.SQLALCHEMY_DATABASE_URI)
is_mysql = url.drivername.startswith("mysql")


def explain(exc):
    t = str(exc)
    print("\n  MySQL problem:", t.splitlines()[0][:200])
    if "2003" in t or "Connection refused" in t or "Can't connect" in t:
        print("""
  -> MySQL is not running (or the host / port is wrong).
     * MySQL installer:  System Settings > MySQL > Start MySQL Server
     * XAMPP / MAMP:     open the app and press Start next to MySQL
     * Docker:           docker compose up -d     (uses docker-compose.yml in this folder)
     * MAMP uses port 8889: set DB_PORT=8889 and DB_PASSWORD=root in .env
     No MySQL yet? Test right now with:  python start.py --sqlite""")
    elif "1045" in t or "Access denied" in t:
        print("\n  -> Wrong MySQL user or password. Fix DB_USER / DB_PASSWORD in the .env file.")
    elif "pymysql" in t.lower() and "No module" in t:
        print("\n  -> Run:  pip install -r requirements.txt")
    sys.exit(1)


print(f"\nBarangay-On   database: {url.drivername.split('+')[0]}"
      + (f"  {url.host}:{url.port or 3306}  /  {url.database}  (user {url.username})" if is_mysql else "  (local file)"))

if is_mysql:
    try:  # connect to the server first, create the database if it is missing
        server = create_engine(url.set(database="mysql"))
        with server.begin() as conn:
            conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{url.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        print("  connected to MySQL, database is ready")
    except Exception as exc:
        explain(exc)

from app import create_app  # noqa: E402
from app.models import User, db  # noqa: E402
from app.seed import load_sample_data  # noqa: E402

app = create_app()
with app.app_context():
    try:
        if args.reset:
            db.drop_all()
        from app.migrate import upgrade_schema
        added = upgrade_schema()  # also upgrades tables left by the older PHP version
        if added:
            print("  database upgraded, added columns: " + ", ".join(added))
        empty = not db.session.scalar(select(User.id).limit(1))
        if args.reset or (empty and app.config["ALLOW_DEMO_LOGINS"]):
            load_sample_data()
            print("  demo data loaded.  Logins: admin / staff / captain / resident   password: password   (LOCAL TESTING ONLY)")
        elif empty:
            print("  database is empty and no demo data was loaded. Set ADMIN_USERNAME and ADMIN_PASSWORD to create the first administrator.")
        else:
            print("  tables OK, existing data kept")
    except Exception as exc:
        explain(exc)

print(f"\n  Open  http://localhost:{args.port}   (Ctrl+C to stop)\n")
app.run(port=args.port, debug=False)
