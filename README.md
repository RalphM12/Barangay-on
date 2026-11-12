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
       python main.py --demo
   It checks MySQL, creates the `barangay_on` database and tables, loads demo data the first time, and starts the site at http://localhost:5000

Demo logins (local testing only, `--demo` mode): `admin`, `staff`, `captain`, `resident` (password: `password`). They are switched off everywhere else.

No MySQL yet? `python main.py --sqlite` runs a local test copy (data is NOT in MySQL).
`python main.py --reset` erases everything and reloads the demo data. `python main.py --port 5050` changes the port.

## Already have a database from the old PHP version?
Just run `python main.py`. It automatically adds the columns the Flask version needs (for example `users.signature`) and keeps all your data. Nothing is deleted.

## Settings
Edit `.env` (same folder as `main.py`; hidden on Mac: Cmd+Shift+. in Finder): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Passwords with special characters work as-is.
`database/barangay-on.sql` can also be imported in phpMyAdmin instead.

## Extra commands
`flask --app wsgi db-info` (which database + row counts) · `flask --app wsgi create-admin` · `flask --app wsgi init-db`.

## Layout
app/api.py (JSON API) · app/pages.py · app/public.py · app/workflow.py (approve > sign > release) · app/core.py · app/templates · app/static.

## Going live (security checklist)
Set these as environment variables / secrets on the host (never commit them):
* `APP_ENV=production`: the app refuses to start without a real `SECRET_KEY`, cookies become https-only.
* `SECRET_KEY`: 32+ random characters: `python3 -c "import secrets; print(secrets.token_hex(32))"`.
* `ADMIN_USERNAME`, `ADMIN_PASSWORD` (10+ characters), optional `ADMIN_NAME`: creates the first administrator when it does not exist yet. Remove `ADMIN_PASSWORD` afterwards.
* `DATABASE_URL` or `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME`: a MySQL user with a strong password.
* `APP_TIMEZONE` (default `Asia/Manila`).

Demo accounts (password `password`) can never log in outside `python main.py --demo`. Start the site with `gunicorn wsgi:app` (not `python wsgi.py`, which is the development server).
Run the tests with `pip install pytest` then `pytest`.

## Deploying on Wasmer (step by step)
1. Create the app from this GitHub repo, preset `python`, leave Build/Install commands empty, **Enable Database** on.
2. In *Environment Variables* add ONLY these four (delete any `DB_*` or `DATABASE_URL` you added yourself, Wasmer supplies the database settings):
   * `APP_ENV` = `production`
   * `SECRET_KEY` = 64 random characters
   * `ADMIN_USERNAME` = `admin`  (or your choice)
   * `ADMIN_PASSWORD` = a strong password, 10+ characters (remove it after the first successful start)
3. Deploy. In *Logs* you should see `connected to MySQL, database is ready` and `Listening on 0.0.0.0:...`.
4. Log in with the admin account, then add staff and the captain from the admin pages.
Uploaded profile photos are stored on the app's disk, which Wasmer may reset on redeploy; re-upload them if they disappear.
