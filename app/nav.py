"""Sidebar menus, Settings sections and the line icons."""
from flask import url_for
from markupsafe import Markup, escape

from .core import current_user, get_user_settings, has_permission, home_for

# key, icon, label, endpoint (relative to the folder), badge
_ADMIN_MENU = [
    ("dashboard", "🏠", "Overview", "dashboard", None),
    ("documents", "📄", "Document Requests", "documents", None),
    ("complaints", "📢", "Complaints", "complaints", None),
    ("community", "⚠️", "Community Reports", "community_reports", None),
    ("residents", "👥", "Residents", "residents", None),
    ("transactions", "🧾", "Transaction History", "transactions", None),
    ("announcements", "📣", "Announcements", "announcements", None),
    ("reports", "📊", "Reports", "reports", None),
    ("notifications", "🔔", "Notifications", "notifications", "unread"),
    ("settings", "⚙️", "Settings", "settings", None),
]
_RESIDENT_MENU = [
    ("dashboard", "🏠", "Overview", "resident.dashboard", None),
    ("documents", "📄", "Documents", "resident.documents", None),
    ("complaints", "📢", "Complaints", "resident.complaints", None),
    ("reports", "⚠️", "Reports", "resident.reports", None),
    ("profile", "👤", "Profile", "resident.profile", None),
    ("notifications", "🔔", "Notifications", "resident.notifications", "unread"),
    ("settings", "⚙️", "Settings", "resident.settings", None),
]


def folder_for(role: str) -> str:
    """Folder (blueprint) that holds a role's pages: resident, staff, or admin (admin and captain share admin)."""
    return {"resident": "resident", "staff": "staff"}.get(role, "admin")


def nav_role_for(user: dict) -> str:
    return {"captain": "captain", "resident": "resident", "staff": "staff"}.get((user or {}).get("role"), "admin")


def nav_items(role: str) -> list:
    """[(key, icon, label, url, badge)] for a role's sidebar."""
    me = current_user()
    if role == "admin" and me and me["role"] == "captain":
        role = "captain"

    def build(prefix):
        return [(k, i, l, url_for(f"{prefix}.{ep}"), b) for k, i, l, ep, b in _ADMIN_MENU]

    if role == "resident":
        items = [(k, i, l, url_for(ep), b) for k, i, l, ep, b in _RESIDENT_MENU]
    elif role == "staff":
        items = build("staff")
    elif role == "captain":
        items = [
            ("dashboard", "🏠", "Overview", url_for("captain.dashboard"), None),
            ("approvals", "✍️", "Sign Documents", url_for("captain.approvals"), "approvals"),
        ]
        for k, i, l, ep, b in _ADMIN_MENU[1:]:
            if k == "notifications":
                items.append((k, i, l, url_for("captain.notifications"), b))
            else:
                items.append((k, i, l, url_for(f"admin.{ep}"), b))
    else:
        items = build("admin")

    if role in ("admin", "staff", "captain"):
        items = [it for it in items if it[0] != "reports" or has_permission("view_reports", me)]
    return items


def settings_sections(user=None) -> list:
    user = user or current_user()
    if not user:
        return []
    ep = f"{folder_for(user['role'])}.settings"
    items = [
        ("general", "🧭", "General", url_for(ep, section="general")),
        ("appearance", "🎨", "Appearance", url_for(ep, section="appearance")),
        ("account", "🔐", "Account & Security", url_for(ep, section="account")),
        ("privacy", "🛡️", "Privacy & Help", url_for(ep, section="privacy")),
    ]
    if user["role"] == "admin":
        items.append(("system", "🛠️", "System Configuration", url_for("admin.settings", section="system")))
        items.append(("users", "👤", "User & Role Management", url_for("admin.users")))
        items.append(("activity", "📜", "Activity Log", url_for("admin.settings", section="activity")))
    return items


def notifications_url(user=None) -> str:
    user = user or current_user()
    role = (user or {}).get("role", "")
    if role == "captain":
        return url_for("captain.notifications")
    return url_for(f"{folder_for(role)}.notifications")


def profile_url(user=None) -> str:
    user = user or current_user()
    role = (user or {}).get("role", "")
    if role == "resident":
        return url_for("resident.profile")
    return url_for(f"{folder_for(role)}.settings", section="account")


def default_page_url(user: dict) -> str:
    key = get_user_settings(int(user["id"])).get("default_page", "dashboard")
    for k, _i, _l, url, _b in nav_items(nav_role_for(user)):
        if k == key:
            return url
    return home_for(user["role"])


def default_page_choices(user: dict) -> dict:
    return {k: l for k, _i, l, _u, _b in nav_items(nav_role_for(user))}


_ICONS = {
    "🏠": '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    "📄": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    "📢": '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    "⚠": '<path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    "👥": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    "🧾": '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    "📣": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "📊": '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    "🔔": '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    "⚙": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    "✍": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    "👤": '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    "🧭": '<circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
    "🎨": '<path d="M12 22a10 10 0 1 1 10-10c0 3-2 4-4 4h-2a2 2 0 0 0-1.5 3.3c.5.7.2 2.7-2.5 2.7z"/><path d="M7.5 11h.01M10 7.5h.01M15 7.5h.01"/>',
    "🔐": '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "🛡": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    "🛠": '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    "📜": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "📅": '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "✔": '<path d="M20 6L9 17l-5-5"/>',
    "→": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "▦": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    "🕘": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "💬": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
    "⎋": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
}


def ui_icon(glyph: str, size: int = 18) -> Markup:
    """Single-colour line icon (follows the text colour, so it follows light / dark mode)."""
    key = glyph.replace("\ufe0f", "")
    if key not in _ICONS:
        return Markup(escape(glyph))
    return Markup(
        f'<svg class="ui-ic" width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true">{_ICONS[key]}</svg>'
    )
