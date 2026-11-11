"""Entry point:  flask --app wsgi run   |   python wsgi.py   |   gunicorn wsgi:app"""
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run()  # never debug=True: it exposes a console that can run code on the server
