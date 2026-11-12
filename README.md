# Barangay-On (Flask + MySQL)

Python 3 + Flask · HTML5/CSS3/JavaScript + Bootstrap · MySQL (SQLite for testing) · ReportLab PDFs · secure uploads.

## Run it (3 steps)
1. **Have MySQL running.** Any one of:
   * MySQL installer from dev.mysql.com (macOS ARM64 DMG), then System Settings > MySQL > Start
   * XAMPP or MAMP: press Start next to MySQL (MAMP: set `DB_PORT=8889`, `DB_PASSWORD=root` in `.env`)
   * Docker Desktop: `docker compose up -d` (then set `DB_PASSWORD=root` in `.env`)
2. **Install packages** (once):
       python3 -m venv venv
       source venv/bin/activate          # Windows: venv\Scripts\activate
       pip install -r requirements.txt
3. **Start everything:**
       python start.py
   It checks MySQL, creates the `barangay_on` database and tables, loads demo data the first time, and starts the site at http://localhost:5000

Demo logins: `admin`, `staff`, `captain`, `resident` (password: `password`).

No MySQL yet? `python start.py --sqlite` runs a local test copy (data is NOT in MySQL).
`python start.py --reset` erases everything and reloads the demo data. `python start.py --port 5050` changes the port.

## Already have a database from the old PHP version?
Just run `python start.py`. It automatically adds the columns the Flask version needs (for example `users.signature`) and keeps all your data. Nothing is deleted.

## Settings
Edit `.env` (same folder as `start.py`; hidden on Mac: Cmd+Shift+. in Finder): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Passwords with special characters work as-is.
`database/barangay_on_mysql.sql` can also be imported in phpMyAdmin instead.

## Extra commands
`flask --app wsgi db-info` (which database + row counts) · `flask --app wsgi create-admin` · `flask --app wsgi init-db`.

## Layout
app/api.py (JSON API) · app/pages.py · app/public.py · app/workflow.py (approve > sign > release) · app/core.py · app/templates · app/static.
Production: `gunicorn wsgi:app` with a real SECRET_KEY.
