"""HTML pages for each role (admin, staff, captain, resident).

The admin and staff folders hold the same pages, so they are generated from one list.
"""
from flask import Blueprint, redirect, render_template, request, url_for

from .core import (
    current_user, has_permission, require_full_access, require_permission, require_role, require_roles,
)
from .nav import folder_for, notifications_url, settings_sections


def render_page(role, active, title, subtitle="", component=None, scripts=(), **ctx):
    return render_template("page.html", role=role, active=active, title=title, subtitle=subtitle,
                           component=component, scripts=list(scripts), **ctx)


SETTINGS_TITLES = {
    "general": ("General", "Language, date and time format, and where you start."),
    "appearance": ("Appearance", "Light or dark mode, font size and layout."),
    "account": ("Account & Security", "Your profile information and password."),
    "privacy": ("Privacy & Help", "Privacy policy, accessibility and support."),
    "system": ("System Configuration", "How this installation is set up."),
    "activity": ("Activity Log", "Recent sign-ins and administrative actions."),
}


def settings_page(layout_role, allowed_roles, settings_role):
    user = require_roles(allowed_roles)
    section = request.args.get("section", "general")
    if section == "notifications":  # Notifications moved out of Settings to the sidebar
        return redirect(notifications_url(user))
    keys = [k for k, *_ in settings_sections(user)]
    if section not in keys or section == "users":
        return redirect(url_for(f"{folder_for(user['role'])}.settings", section="general"))
    title, sub = SETTINGS_TITLES.get(section, SETTINGS_TITLES["general"])
    scripts = ["settings.js"]
    if section == "account":
        scripts = ["account.js", "settings.js"]
    elif section == "activity":
        scripts = ["activity.js"]
    elif section in ("privacy", "system"):
        scripts = []
    return render_page(layout_role, "settings." + section, title, sub, "settings", scripts,
                       settings_role=settings_role, section=section)


def _shared_pages(bp, folder):
    """Pages that admin (and captain) and staff have in common."""
    staff = folder == "staff"
    roles = ["staff"] if staff else ["admin", "captain"]
    layout = "staff" if staff else "admin"

    @bp.get("/dashboard")
    def dashboard():
        user = require_roles(roles)
        return render_template("dashboard_admin.html", user=user, role=layout, folder=folder)

    @bp.get("/documents")
    def documents():
        require_roles(roles)
        can = has_permission("approve_documents")
        if staff:
            sub = ("Approve pending requests: an approved request goes to the Barangay Captain automatically for signing. "
                   "Once the Captain signs it, press Print: printing the signed document releases it automatically. "
                   "Released documents leave this list and are kept in Transaction History.")
        else:
            sub = ("Approve pending requests: an approved request goes to the Barangay Captain automatically for signing. "
                   "Once the Captain signs it, release it here. Released documents leave this list and are kept in Transaction History.")
        sub += " Tick several pending requests to approve them in bulk." if can else " You are viewing these requests (monitoring only)."
        return render_page(layout, "documents", "Document Requests", sub, "documents",
                           ["certificate.js", "tx.js", "doc_forms.js", "autofill.js"], can_approve=can)

    for key, ep, title, cat, sub in (
        ("complaints", "complaints", "Complaints", "complaint",
         "Complaints filed by residents. Staff update their status; the administrator monitors."),
        ("community", "community_reports", "Community Reports", "report",
         "Community reports such as missing persons and broken streetlights. Staff update their status; the administrator monitors."),
    ):
        def make(key=key, title=title, cat=cat, sub=sub):
            def view():
                require_roles(roles)
                mode = "manage" if has_permission("manage_complaints") else "view"
                return render_page(layout, key, title, sub, "tx_table", ["tx.js"], mode=mode, category=cat, status="", bulk=False)
            return view
        bp.add_url_rule(f"/{ep}", endpoint=ep, view_func=make())

    @bp.get("/residents")
    def residents():
        require_roles(roles)
        sub = ("Add and edit resident records. Only the administrator can delete a resident." if staff
               else "Add, edit and delete resident records. Only the administrator can delete a resident.")
        return render_page(layout, "residents", "Residents", sub, "residents", ["residents.js"], manage=True)

    @bp.get("/transactions")
    def transactions():
        require_roles(roles)
        return render_page(layout, "transactions", "Transaction History",
                           "Every released document is kept here with its release date, time and the staff member responsible, latest first.",
                           "history", ["history.js"])

    @bp.get("/announcements")
    def announcements():
        require_roles(roles)
        return render_page(layout, "announcements", "Announcements",
                           "Announcements are shown on the main page for residents. Posted by admin / staff.",
                           "announcements", ["announcements.js"], can_post=has_permission("post_announcements"))

    @bp.get("/reports")
    def reports():
        require_roles(roles)
        require_permission("view_reports")
        return render_page(layout, "reports", "Reports", "Summary of barangay transactions for a date range.", "reports", ["reports.js"])

    @bp.get("/notifications")
    def notifications():
        user = require_roles(roles)
        if user["role"] == "captain":
            return redirect(url_for("captain.notifications"))
        return render_page(layout, "notifications", "Notifications", "Announcement preferences and your notification list.",
                           "settings", ["settings.js", "notifications.js"], settings_role=layout, section="notifications")

    @bp.get("/settings")
    def settings():
        return settings_page(layout, roles, layout)

    if not staff:
        @bp.get("/users")
        def users():
            require_full_access()
            return render_page("admin", "settings.users", "User & Role Management",
                               "Create admins, add staff, and choose what each staff member is allowed to do.", "users", ["users.js"])

        @bp.get("/resident_accounts")
        def resident_accounts():
            require_full_access()
            return render_page("admin", "resaccounts", "Resident Accounts",
                               "See resident usernames and set a new password for residents who are locked out.",
                               "resident_accounts", ["resident_accounts.js"])


def register_pages(app):
    admin = Blueprint("admin", __name__, url_prefix="/admin")
    staff = Blueprint("staff", __name__, url_prefix="/staff")
    captain = Blueprint("captain", __name__, url_prefix="/captain")
    resident = Blueprint("resident", __name__, url_prefix="/resident")
    _shared_pages(admin, "admin")
    _shared_pages(staff, "staff")

    # ---------------------------------------------------------------- captain
    @captain.get("/dashboard")
    def dashboard():
        user = require_role("captain")
        return render_template("dashboard_captain.html", user=user)

    @captain.get("/approvals")
    def approvals():
        require_role("captain")
        return render_page("captain", "approvals", "Sign Documents",
                           "Documents that staff approved are sent to you automatically. Sign them here (one or many at once): "
                           "a signed document goes back to staff, who release it to the resident.",
                           "tx_table", ["certificate.js", "tx.js"], mode="sign", category="document", status="Approved", bulk=True)

    @captain.get("/notifications")
    def notifications():
        require_role("captain")
        return render_page("captain", "notifications", "Notifications", "Announcement preferences and your notification list.",
                           "settings", ["settings.js", "notifications.js"], settings_role="admin", section="notifications")

    # ---------------------------------------------------------------- resident
    @resident.get("/dashboard")
    def dashboard():
        user = require_role("resident")
        return render_template("dashboard_resident.html", user=user)

    @resident.get("/documents")
    def documents():
        require_role("resident")
        return render_page("resident", "documents", "Documents", "Request barangay documents and track them.", "resident_tx",
                           ["doc_forms.js", "resident_tx.js"], category="document", type_label="Document type",
                           detail_label="Purpose / details", button="Request a Document")

    @resident.get("/complaints")
    def complaints():
        require_role("resident")
        return render_page("resident", "complaints", "Complaints", "File a complaint and follow its progress.", "resident_tx",
                           ["resident_tx.js"], category="complaint", type_label="Complaint type",
                           detail_label="Describe your complaint", button="File a Complaint")

    @resident.get("/reports")
    def reports():
        require_role("resident")
        return render_page("resident", "reports", "Community Reports", "Report a concern in your community.", "resident_tx",
                           ["resident_tx.js"], category="report", type_label="Report type",
                           detail_label="Describe what happened and where", button="Submit a Community Report")

    @resident.get("/profile")
    def profile():
        require_role("resident")
        return render_page("resident", "profile", "Profile", "Update your details and password.", "account", ["account.js", "settings.js"])

    @resident.get("/notifications")
    def notifications():
        require_role("resident")
        return render_page("resident", "notifications", "Notifications",
                           "Announcement and request-status preferences, and your notification list.",
                           "settings", ["settings.js", "notifications.js"], settings_role="resident", section="notifications")

    @resident.get("/settings")
    def settings():
        return settings_page("resident", ["resident"], "resident")

    for bp in (admin, staff, captain, resident):
        app.register_blueprint(bp)
