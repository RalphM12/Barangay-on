"""JSON API used by the front-end scripts (assets/js/*.js).

One function per former ``api/*.php`` file; the JSON shapes are unchanged so the existing JavaScript keeps working.
"""
import base64
import csv
import io
import re
import secrets
from datetime import date, datetime, timedelta

from flask import Blueprint, Response, jsonify, request, session
from PIL import Image, UnidentifiedImageError
from sqlalchemy import and_, case, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from . import workflow
from .core import (
    PERMISSIONS, SETTING_CHOICES, SETTING_DEFAULTS, SETTING_GROUPS, ROLE_LABELS, ApiError, add_notification,
    avatar_dir, avatar_url, captain_signature, csrf_check, full_name_expr, get_user_settings, has_permission,
    hash_password, latest_notifications, log_activity, next_tracking_no, notify_role, notify_staff, page_args,
    parse_date, reg_no, require_full_access, require_permission, require_role, require_roles, require_staff, rows,
    squash, store_settings, unread_count, valid_date, verify_password,
)
from .models import (
    Announcement, ActivityLog, Notification, Resident, Service, Transaction, User, UserPermission, UserSetting, db, now,
)
from .nav import default_page_choices
from .workflow import CIVIL_STATUSES, DOC_PURPOSES, build_document_details, sign_documents, staff_document_step, statuses_for

bp = Blueprint("api", __name__, url_prefix="/api")

CATEGORIES = ["document", "complaint", "report"]
STATUS_ORDER = ["Pending", "Approved", "Released", "Under Review", "Resolved", "Rejected"]
RES_STATUSES = ["Registered", "Pending", "Inactive"]
OTHER_SERVICE = "Others"


def ok(**extra):
    return jsonify({"ok": True, **extra})


def start_of(d: date) -> datetime:
    return datetime(d.year, d.month, d.day)


def day_range(start: date, end: date):
    """created_at between two dates, both included."""
    return and_(Transaction.created_at >= start_of(start), Transaction.created_at < start_of(end + timedelta(days=1)))


def paged(query, page, per):
    return query.limit(per).offset((page - 1) * per)


def tx_join(q):
    return q.join(Service, Service.id == Transaction.service_id).join(Resident, Resident.id == Transaction.resident_id)


def status_sort(status_col):
    return case(*[(status_col == s, i) for i, s in enumerate(STATUS_ORDER)], else_=99)


def valid_birthdate(value: str, *, oldest=None):
    """Return a date or raise 422 (empty string -> None)."""
    if value == "":
        return None
    try:
        bd = datetime.strptime(value, "%Y-%m-%d").date()
        if bd.strftime("%Y-%m-%d") != value:
            raise ValueError
    except ValueError:
        raise ApiError("Please enter a valid birthday." if oldest == "120" else "Please enter a valid date of birth.", 422)
    limit = date.today().replace(year=date.today().year - 120) if oldest == "120" else date(1900, 1, 1)
    if bd > date.today() or bd < limit:
        raise ApiError("Please enter a valid birthday." if oldest == "120" else "Please enter a valid date of birth.", 422)
    return bd


def clean_contact(raw: str) -> str:
    raw = (raw or "").strip()
    if not re.fullmatch(r"[0-9+\-\s()]{0,20}", raw):
        raise ApiError("Contact number may only contain digits.", 422)
    digits = re.sub(r"\D+", "", raw)
    if len(digits) > 11:
        raise ApiError("Contact number can have at most 11 digits.", 422)
    return digits


# ======================================================================================
#  Dashboards
# ======================================================================================


@bp.get("/admin_dashboard")
def admin_dashboard():
    user = require_staff(True)
    t = Transaction

    def pending(cat):
        return db.session.scalar(
            select(func.count()).select_from(t).join(Service, Service.id == t.service_id)
            .where(Service.category == cat, t.status.in_(["Pending", "Under Review"]))
        ) or 0

    today = date.today()
    week_start = start_of(today - timedelta(days=6))
    stats = {
        "documents_pending": pending("document"),
        "complaints_pending": pending("complaint"),
        "reports_pending": pending("report"),
        "total_residents": db.session.scalar(
            select(func.count()).select_from(Resident).where(Resident.status == "Registered", Resident.deleted_at.is_(None))) or 0,
        "today_transactions": db.session.scalar(
            select(func.count()).select_from(t).where(t.created_at >= start_of(today), t.status != "Inactive")) or 0,
    }
    status_counts = rows(db.session.execute(
        select(t.status, func.count().label("total")).where(t.created_at >= week_start, t.status != "Inactive")
        .group_by(t.status).order_by(status_sort(t.status))))
    breakdown = {"document": 0, "complaint": 0, "report": 0}
    for cat, total in db.session.execute(
        select(Service.category, func.count()).select_from(t).join(Service, Service.id == t.service_id)
        .where(t.created_at >= week_start, t.status != "Inactive").group_by(Service.category)
    ):
        breakdown[cat] = int(total)
    per_day = {}
    for (created,) in db.session.execute(select(t.created_at).where(t.created_at >= week_start, t.status != "Inactive")):
        per_day[created.date()] = per_day.get(created.date(), 0) + 1
    weekly = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        weekly.append({"date": d.strftime("%Y-%m-%d"), "total": per_day.get(d, 0)})
    recent = rows(db.session.execute(
        tx_join(select(t.id, t.tracking_no, Service.name.label("service"), full_name_expr().label("resident"), t.status, t.created_at))
        .where(t.status != "Inactive").order_by(t.created_at.desc(), t.id.desc()).limit(5)))
    return jsonify({
        "user": {"name": user["full_name"], "position": user["position"]},
        "stats": stats, "status_counts": status_counts, "breakdown": breakdown, "weekly": weekly, "recent": recent,
        "notifications": latest_notifications(int(user["id"]), 5), "unread": unread_count(int(user["id"])),
    })


@bp.get("/resident_dashboard")
def resident_dashboard():
    user = require_role("resident", True)
    rid = db.session.scalar(select(Resident.id).where(Resident.user_id == user["id"]).limit(1)) or 0
    t = Transaction

    def count(statuses):
        return db.session.scalar(select(func.count()).select_from(t).where(t.resident_id == rid, t.status.in_(statuses))) or 0

    recent = rows(db.session.execute(
        select(t.tracking_no, Service.name.label("service"), t.status, t.created_at)
        .join(Service, Service.id == t.service_id).where(t.resident_id == rid, t.status != "Inactive")
        .order_by(t.created_at.desc(), t.id.desc()).limit(5)))
    return jsonify({
        "user": {"name": user["full_name"]},
        "stats": {"pending": count(["Pending"]), "processing": count(["Under Review"]), "completed": count(["Released", "Resolved"])},
        "recent": recent, "unread": unread_count(int(user["id"])),
    })


def _awaiting_signature():
    t = Transaction
    return and_(t.status == "Approved", t.endorsed_at.is_not(None), t.signed_at.is_(None), Service.category == "document")


@bp.get("/captain_dashboard")
def captain_dashboard():
    user = require_role("captain", True)
    t = Transaction
    base = select(func.count()).select_from(t).join(Service, Service.id == t.service_id).where(Service.category == "document")
    month_start = start_of(date.today().replace(day=1))
    stats = {
        "to_sign": db.session.scalar(base.where(_awaiting_signature())) or 0,
        "signed_month": db.session.scalar(base.where(t.signed_by == user["id"], t.signed_at >= month_start)) or 0,
        "signed_total": db.session.scalar(base.where(t.signed_by == user["id"])) or 0,
    }
    pending = rows(db.session.execute(
        tx_join(select(t.id, t.tracking_no, Service.name.label("service"), full_name_expr().label("resident"), t.created_at))
        .where(_awaiting_signature()).order_by(t.created_at.asc()).limit(10)))
    return jsonify({
        "user": {"name": user["full_name"], "position": user["position"]}, "stats": stats, "pending": pending,
        "notifications": latest_notifications(int(user["id"]), 4), "unread": unread_count(int(user["id"])),
    })


@bp.route("/captain_action", methods=["GET", "POST"])
def captain_action():
    user = require_role("captain", True)
    if request.method != "POST":
        raise ApiError("POST required", 405)
    csrf_check()
    action = request.form.get("action", "")
    if action in ("sign", "sign_bulk"):
        ids = [request.form.get("id", 0)] if action == "sign" else request.form.getlist("ids[]") or request.form.getlist("ids")
        if not ids:
            raise ApiError("Select at least one document to sign.", 422)
        count = sign_documents(ids, int(user["id"]), user["username"])
        if count == 0:
            raise ApiError("This document is no longer waiting for your signature (or staff has not approved it yet).", 409)
        return ok(signed=count)
    raise ApiError("Unknown action", 400)


# ======================================================================================
#  Transactions (staff / admin / captain)
# ======================================================================================


def permission_for(category: str) -> str:
    return "approve_documents" if category == "document" else "manage_complaints"


def _insert_transaction(category, resident_id, service_id, status, details, tries=5):
    """Insert with the next free tracking number; retry if two people save at the same moment."""
    for attempt in range(tries):
        tracking = next_tracking_no(category)
        db.session.add(Transaction(tracking_no=tracking, resident_id=resident_id, service_id=service_id, status=status, details=details))
        try:
            db.session.commit()
            return tracking
        except IntegrityError:
            db.session.rollback()
            if attempt == tries - 1:
                raise
    return ""


@bp.route("/transactions", methods=["GET", "POST"])
def transactions():
    user = require_roles(["admin", "staff", "captain"], True)
    t = Transaction

    if request.method == "POST":
        csrf_check()
        action = request.form.get("action", "")

        if action in ("approve", "bulk_approve", "release"):
            if not has_permission("approve_documents", user):
                raise ApiError("Only staff with the document permission can approve or release documents.", 403)
            step = "release" if action == "release" else "approve"
            if action == "bulk_approve":
                raw = request.form.getlist("ids[]") or request.form.getlist("ids")
            else:
                raw = [request.form.get("id", 0)]
            ids = sorted({int(i) for i in raw if str(i).isdigit() and int(i) > 0})
            if not ids:
                raise ApiError("Select at least one pending document.", 422)
            if len(ids) > 100:
                raise ApiError("Select 100 documents or fewer at a time.", 422)
            done, first_error, last = 0, None, None
            for doc_id in ids:
                res = staff_document_step(doc_id, user, step)
                if res.get("ok"):
                    done += 1
                    last = res["tracking_no"]
                elif first_error is None:
                    first_error = res
            if done == 0:
                raise ApiError((first_error or {}).get("error", "Nothing was changed."), (first_error or {}).get("code", 409))
            if step == "approve":
                notify_role("captain", "Document waiting for signature",
                            "Staff approved a document request. It needs your signature." if done == 1
                            else f"Staff approved {done} document requests. They need your signature.", "warning")
                db.session.commit()
            return ok(count=done, skipped=len(ids) - done, tracking_no=last if done == 1 else None, step=step)

        if action == "create_document":
            return _create_document(user)

        if action != "update_status":
            raise ApiError("Unknown action", 400)

        tx_id = request.form.get("id", 0, type=int)
        status = request.form.get("status", "")
        row = db.session.execute(
            tx_join(select(t.tracking_no, t.status, Service.category, Resident.user_id)).where(t.id == tx_id)).first()
        if not row:
            raise ApiError("Transaction not found.", 404)
        if row.category == "document":
            raise ApiError("Documents are approved and released with the Approve / Release buttons on the Document Requests page.", 422)
        if not has_permission(permission_for(row.category), user):
            raise ApiError("You do not have permission to change this status.", 403)
        if status not in statuses_for(row.category):
            raise ApiError("Invalid status.", 422)
        if row.status != status:
            db.session.execute(update(t).where(t.id == tx_id).values(status=status))
            if row.user_id:
                type_ = "success" if status == "Resolved" else ("warning" if status == "Rejected" else "info")
                add_notification(row.user_id, "Request update", f"Your request {row.tracking_no} is now: {status}.", type_, "requests")
            db.session.commit()
        return ok()

    # ---------- one transaction ----------
    if request.args.get("id") is not None:
        item = db.session.get(t, request.args.get("id", 0, type=int))
        if not item:
            raise ApiError("Transaction not found.", 404)
        svc, res = item.service, item.resident

        def name_of(uid):
            u = db.session.get(User, uid) if uid else None
            return u

        signer, approver, releaser = name_of(item.signed_by), name_of(item.approved_by), name_of(item.released_by)
        captain = db.session.execute(
            select(User.full_name).where(User.role == "captain", or_(User.term_ended_at.is_(None), User.term_ended_at > now()))
            .order_by(User.id.desc()).limit(1)).scalar()
        can_edit = has_permission(permission_for(svc.category), user)
        signature = ""
        if item.signed_at:
            signature = item.signature_snapshot or ""
            if signature == "" and item.signed_by:
                signature = captain_signature(int(item.signed_by))
        fv = lambda v: v.strftime("%Y-%m-%d %H:%M:%S") if v else None  # noqa: E731
        data = {
            "id": item.id, "tracking_no": item.tracking_no, "resident_id": item.resident_id, "service": svc.name,
            "category": svc.category, "status": item.status, "details": item.details,
            "created_at": fv(item.created_at), "updated_at": fv(item.updated_at), "released_at": fv(item.released_at),
            "approved_at": fv(item.approved_at), "signed_at": fv(item.signed_at), "endorsed_at": fv(item.endorsed_at),
            "signed_by": item.signed_by_name or (signer.full_name if signer else None),
            "approved_by": approver.full_name if approver else None,
            "released_by": releaser.full_name if releaser else None,
            "approved_by_position": approver.position if approver else None,
            "captain_name": captain,
            "resident": f"{res.first_name} {res.last_name}", "address": res.address, "contact_no": res.contact_no,
            "birthdate": res.birthdate.strftime("%Y-%m-%d") if res.birthdate else None, "civil_status": res.civil_status,
            "signature": signature,
        }
        return jsonify({
            "item": data, "can_edit": can_edit,
            "can_approve": can_edit and svc.category == "document" and item.status == "Pending" and not item.endorsed_at,
            "can_release": can_edit and svc.category == "document" and item.status == "Approved" and bool(item.signed_at) and not item.released_at,
            "can_sign": user["role"] == "captain" and svc.category == "document" and item.status == "Approved" and bool(item.endorsed_at) and not item.signed_at,
            "allowed_statuses": statuses_for(svc.category),
        })

    # ---------- list ----------
    where = [t.status != "Released"]
    category = request.args.get("category", "")
    if category in CATEGORIES:
        where.append(Service.category == category)
        list_statuses = statuses_for(category)
    else:
        list_statuses = list(dict.fromkeys(statuses_for("document") + statuses_for("complaint")))
    list_statuses = [s for s in list_statuses if s != "Released"]
    status = request.args.get("status", "")
    where.append(t.status == status if status in list_statuses else t.status != "Inactive")
    if request.args.get("endorsed") == "1":
        where += [t.endorsed_at.is_not(None), t.signed_at.is_(None)]
    service_id = request.args.get("service_id", 0, type=int)
    if service_id and service_id > 0:
        where.append(t.service_id == service_id)
    q = (request.args.get("q") or "").strip()
    if q:
        where.append(or_(t.tracking_no.contains(q, autoescape=True), Service.name.contains(q, autoescape=True),
                         full_name_expr().contains(q, autoescape=True)))
    page, per = page_args()
    total = db.session.scalar(tx_join(select(func.count()).select_from(t)).where(*where)) or 0
    data = rows(db.session.execute(paged(
        tx_join(select(t.id, t.tracking_no, Service.name.label("service"), Service.category,
                       full_name_expr().label("resident"), t.status, t.created_at, t.endorsed_at, t.signed_at))
        .where(*where).order_by(t.created_at.desc(), t.id.desc()), page, per)))
    services = rows(db.session.execute(select(Service.id, Service.name).where(Service.category == category).order_by(Service.name))) \
        if category in CATEGORIES else []
    return jsonify({"rows": data, "total": total, "page": page, "per_page": per, "statuses": list_statuses, "services": services})


def _create_document(user):
    """Staff files a certificate request for a registered resident (or a walk-in) at the barangay hall."""
    if not has_permission("approve_documents", user):
        raise ApiError("Only staff with the document permission can create document requests.", 403)
    f = request.form
    resident_id = f.get("resident_id", 0, type=int) or 0
    service_id = f.get("service_id", 0, type=int) or 0
    walkin = f.get("walkin", "") == "1"

    svc = db.session.execute(select(Service).where(Service.id == service_id, Service.category == "document")).scalar()
    if not svc:
        raise ApiError("Please choose the certificate type.", 422)
    details = build_document_details({"first_name": "", "last_name": ""}, svc.name)

    if walkin:
        full = squash(f.get("full_name", ""))
        w_addr = (f.get("address") or "").strip()
        w_contact = (f.get("contact_no") or "").strip()
        if full == "" or len(full) > 100:
            raise ApiError("Enter the full name of the person (100 characters max).", 422)
        if len(w_addr) > 150:
            raise ApiError("The address is too long (150 characters max).", 422)
        w_contact = clean_contact(w_contact)
        cut = full.rfind(" ")
        first, last = (full, "") if cut < 0 else (full[:cut], full[cut + 1:])
        if len(first) > 60 or len(last) > 60:
            raise ApiError("First or last name is too long.", 422)
        existing = db.session.execute(select(Resident).where(
            Resident.is_walkin.is_(True), Resident.deleted_at.is_(None), Resident.first_name == first,
            Resident.last_name == last, Resident.address == w_addr).limit(1)).scalar()
        if not existing:
            existing = Resident(first_name=first, last_name=last, address=w_addr, contact_no=w_contact, status="Inactive", is_walkin=True)
            db.session.add(existing)
            db.session.flush()
        elif w_contact:
            existing.contact_no = w_contact
        resident_id = existing.id
        res = {"id": existing.id, "user_id": None, "first_name": first, "last_name": last, "address": w_addr}
    else:
        r = db.session.execute(select(Resident).where(Resident.id == resident_id, Resident.deleted_at.is_(None), Resident.is_walkin.is_(False))).scalar()
        if not r:
            raise ApiError("Please search for and select a registered resident, or type the name of a non-registered person.", 422)
        if r.status != "Registered":
            raise ApiError(f"This resident is {r.status}, not Registered. Update the resident record first.", 422)
        if (r.address or "").strip() == "":
            raise ApiError("This resident has no address on record. Add it on the Residents page first - it is not filled in for you.", 422)
        res = {"id": r.id, "user_id": r.user_id, "first_name": r.first_name, "last_name": r.last_name, "address": r.address}

    dupe = db.session.scalar(select(Transaction.tracking_no).where(
        Transaction.resident_id == resident_id, Transaction.service_id == service_id, Transaction.status == "Pending").limit(1))
    if dupe and f.get("confirm_duplicate", "") != "1":
        raise ApiError(f"This resident already has a pending {svc.name} ({dupe}).", 409, duplicate=True, tracking_no=dupe)

    details += f"\nFiled at the barangay hall by staff: {user['full_name']} on {date.today():%Y-%m-%d}"
    tracking = _insert_transaction("document", resident_id, service_id, "Pending", details, tries=3)
    who = "NON-REGISTERED person" if walkin else "resident " + reg_no(resident_id)
    log_activity("Document request filed",
                 f"{tracking} ({svc.name}) for {who} {res['first_name']} {res['last_name']}" + (" [duplicate confirmed]" if dupe else ""), user)
    if res["user_id"]:
        add_notification(res["user_id"], "Request received", f"A {svc.name} request ({tracking}) was filed for you at the barangay hall.", "success", "requests")
        db.session.commit()
    return ok(tracking_no=tracking)


@bp.get("/transaction_history")
def transaction_history():
    require_staff(True)
    t = Transaction
    where = [Service.category == "document", t.status == "Released"]
    q = (request.args.get("q") or "").strip()
    if q:
        where.append(or_(t.tracking_no.contains(q, autoescape=True), Service.name.contains(q, autoescape=True),
                         full_name_expr().contains(q, autoescape=True)))
    page, per = page_args()
    total = db.session.scalar(tx_join(select(func.count()).select_from(t)).where(*where)) or 0
    when = func.coalesce(t.released_at, t.updated_at)
    releaser = select(User.full_name).where(User.id == t.released_by).correlate(t).scalar_subquery()
    signer = select(User.full_name).where(User.id == t.signed_by).correlate(t).scalar_subquery()
    data = rows(db.session.execute(paged(
        tx_join(select(t.id, t.tracking_no, Service.name.label("service"), Service.category, t.status,
                       full_name_expr().label("resident"), when.label("released_at"),
                       func.coalesce(releaser, signer).label("released_by")))
        .where(*where).order_by(when.desc(), t.id.desc()), page, per)))
    return jsonify({"rows": data, "total": total, "page": page, "per_page": per})


# ======================================================================================
#  Resident: own transactions
# ======================================================================================


@bp.route("/my_transactions", methods=["GET", "POST"])
def my_transactions():
    user = require_role("resident", True)
    resident = db.session.execute(select(Resident).where(Resident.user_id == user["id"], Resident.deleted_at.is_(None)).limit(1)).scalar()
    if not resident:
        raise ApiError("No resident profile is linked to your account. Please contact the barangay office.", 400)
    category = request.args.get("category") or request.form.get("category", "")
    if category not in CATEGORIES:
        raise ApiError("Invalid category.", 422)

    if request.method == "POST":
        csrf_check()
        f = request.form
        if f.get("action", "") != "create":
            raise ApiError("Unknown action", 400)
        service = None
        if category == "document":
            service_id = f.get("service_id", 0, type=int) or 0
            service = db.session.execute(select(Service).where(Service.id == service_id, Service.category == "document")).scalar()
            if not service:
                raise ApiError("Please choose a valid document type.", 422)
            details = build_document_details({"first_name": resident.first_name, "last_name": resident.last_name}, service.name)
        else:
            details = (f.get("details") or "").strip()
        if details == "":
            raise ApiError("Please fill in the details.", 422)
        if len(details) > 1000:
            raise ApiError("Details are too long (1000 characters max).", 422)

        if f.get("service_id", "") == "other" and category != "document":
            other = squash(f.get("other_specify", ""))
            if other == "":
                raise ApiError('Please specify the type in the "Others" box.', 422)
            if len(other) > 100:
                raise ApiError('The "Others" description is too long (100 characters max).', 422)
            service = db.session.execute(select(Service).where(Service.name == OTHER_SERVICE, Service.category == category).limit(1)).scalar()
            if not service:
                service = Service(name=OTHER_SERVICE, category=category)
                db.session.add(service)
                db.session.flush()
            details = f"Type (Others): {other}\n{details}"
        elif category != "document":
            service_id = f.get("service_id", 0, type=int) or 0
            service = db.session.execute(select(Service).where(Service.id == service_id, Service.category == category)).scalar()
            if not service:
                raise ApiError("Please choose a valid type.", 422)

        tracking = _insert_transaction(category, resident.id, service.id, "Pending" if category == "document" else "Under Review", details)
        notify_staff("New " + ("community report" if category == "report" else category),
                     f"{service.name} ({tracking}) was submitted by {resident.first_name} {resident.last_name}.", "info")
        add_notification(int(user["id"]), "Request received", f"Your request {tracking} was submitted.", "success")
        db.session.commit()
        return ok(tracking_no=tracking)

    t = Transaction
    data = rows(db.session.execute(
        select(t.id, t.tracking_no, Service.name.label("service"), t.status, t.details, t.created_at, t.updated_at)
        .join(Service, Service.id == t.service_id).where(t.resident_id == resident.id, Service.category == category)
        .order_by(t.created_at.desc(), t.id.desc()).limit(100)))
    services = rows(db.session.execute(
        select(Service.id, Service.name).where(Service.category == category, Service.name != OTHER_SERVICE).order_by(Service.name)))
    return jsonify({
        "rows": data, "services": services,
        "profile": {"resident_no": reg_no(resident.id), "name": f"{resident.first_name} {resident.last_name}",
                    "address": resident.address, "contact_no": resident.contact_no, "status": resident.status},
        "purposes": DOC_PURPOSES, "civil_statuses": CIVIL_STATUSES, "today": date.today().strftime("%Y-%m-%d"),
    })


# ======================================================================================
#  Users & roles (administrator)
# ======================================================================================

USERNAME_RE = r"[A-Za-z0-9_.-]{3,50}"


@bp.route("/users", methods=["GET", "POST"])
def users():
    require_full_access(True)
    if request.method == "POST":
        csrf_check()
        f = request.form
        action = f.get("action", "")
        perms = [p for p in PERMISSIONS if p in f.getlist("permissions[]") + f.getlist("permissions")]

        def save_perms(uid):
            db.session.execute(delete(UserPermission).where(UserPermission.user_id == uid))
            for p in perms:
                db.session.add(UserPermission(user_id=uid, permission=p))

        if action == "create":
            username, name = (f.get("username") or "").strip(), (f.get("full_name") or "").strip()
            position, password, role = (f.get("position") or "").strip(), f.get("password", ""), f.get("role", "")
            if role not in ("admin", "staff"):
                raise ApiError("Choose Administrator or Staff.", 422)
            if not re.fullmatch(USERNAME_RE, username):
                raise ApiError("Username must be 3-50 letters, numbers, dot, dash or underscore.", 422)
            if name == "" or len(name) > 100 or len(position) > 80:
                raise ApiError("Please enter the full name (100 characters max).", 422)
            if len(password) < 8:
                raise ApiError("Password must be at least 8 characters.", 422)
            if db.session.scalar(select(func.count()).select_from(User).where(User.username == username)):
                raise ApiError("That username is already taken.", 409)
            position = position or ("Administrator" if role == "admin" else "Barangay Staff")
            u = User(username=username, password_hash=hash_password(password), full_name=name, position=position, role=role)
            db.session.add(u)
            db.session.flush()
            if role == "staff":
                save_perms(u.id)
            db.session.commit()
            log_activity("User created", f"Created {role} account '{username}'")
            return ok()

        if action == "new_captain":
            username, name, password = (f.get("username") or "").strip(), (f.get("full_name") or "").strip(), f.get("password", "")
            start = valid_date((f.get("term_start") or "").strip()) or date.today().strftime("%Y-%m-%d")
            if not re.fullmatch(USERNAME_RE, username):
                raise ApiError("Username must be 3-50 letters, numbers, dot, dash or underscore.", 422)
            if name == "" or len(name) > 100:
                raise ApiError("Please enter the full name of the new captain (100 characters max).", 422)
            if len(password) < 8:
                raise ApiError("Password must be at least 8 characters.", 422)
            if db.session.scalar(select(func.count()).select_from(User).where(User.username == username)):
                raise ApiError("That username is already taken.", 409)
            # the new captain takes over: the serving captain's term ends now (the account is kept for the records)
            db.session.execute(update(User).where(User.role == "captain", or_(User.term_ended_at.is_(None), User.term_ended_at > now()))
                               .values(term_ended_at=now()))
            db.session.add(User(username=username, password_hash=hash_password(password), full_name=name,
                                position="Punong Barangay", role="captain", term_start=parse_date(start)))
            db.session.commit()
            log_activity("New captain", f"Term ended for the previous captain; '{username}' is now the Barangay Captain")
            return ok()

        if action == "end_term":
            row = db.session.get(User, f.get("id", 0, type=int) or 0)
            if not row or row.role != "captain":
                raise ApiError("Captain account not found.", 404)
            db.session.execute(update(User).where(User.id == row.id, or_(User.term_ended_at.is_(None), User.term_ended_at > now()))
                               .values(term_ended_at=now()))
            db.session.commit()
            log_activity("Captain term ended", f"Ended the term of captain '{row.username}'")
            return ok()

        if action == "permissions":
            uid = f.get("id", 0, type=int) or 0
            row = db.session.get(User, uid)
            if not row:
                raise ApiError("User not found.", 404)
            if row.role != "staff":
                raise ApiError("Permissions can only be changed for staff accounts. The administrator monitors and the captain signs documents.", 422)
            save_perms(uid)
            add_notification(uid, "Your permissions were updated", "The administrator changed what you can do in the system.", "info")
            db.session.commit()
            log_activity("Permissions changed", f"Updated permissions of user #{uid}")
            return ok()
        raise ApiError("Unknown action", 400)

    where = [User.role != "resident"]
    role = request.args.get("role", "")
    if role in ("admin", "staff", "captain"):
        where.append(User.role == role)
    q = (request.args.get("q") or "").strip()
    if q:
        where.append(or_(User.username.contains(q, autoescape=True), User.full_name.contains(q, autoescape=True)))
    page, per = page_args()
    total = db.session.scalar(select(func.count()).select_from(User).where(*where)) or 0
    serving = and_(User.role == "captain", or_(User.term_ended_at.is_(None), User.term_ended_at > now()))
    role_order = case((User.role == "admin", 1), (User.role == "staff", 2), (User.role == "captain", 3), else_=4)
    ended_last = case((and_(User.role == "captain", User.term_ended_at.is_not(None)), 1), else_=0)
    data = rows(db.session.execute(paged(
        select(User.id, User.username, User.full_name, User.position, User.role, User.created_at, User.term_start, User.term_ended_at,
               case((serving, 1), else_=0).label("serving"),
               case((and_(User.signature.is_not(None), User.signature != ""), 1), else_=0).label("has_signature"))
        .where(*where).order_by(role_order, ended_last, User.full_name), page, per)))
    granted = {}
    for uid, perm in db.session.execute(select(UserPermission.user_id, UserPermission.permission)):
        granted.setdefault(uid, []).append(perm)
    for r in data:
        r["permissions"] = granted.get(r["id"], []) if r["role"] == "staff" else []
    return jsonify({"rows": data, "total": total, "page": page, "per_page": per, "permissions": PERMISSIONS})


# ======================================================================================
#  Account of the logged-in user
# ======================================================================================

AVATAR_TYPES = {"JPEG": "jpg", "PNG": "png", "GIF": "gif", "WEBP": "webp"}
AVATAR_NAME_RE = r"u{uid}_[a-f0-9]+\.[a-z]+"


def _remove_avatar_file(uid: int, old: str):
    if old and re.fullmatch(AVATAR_NAME_RE.format(uid=uid), old):
        try:
            (avatar_dir() / old).unlink()
        except OSError:
            pass


@bp.route("/account", methods=["GET", "POST"])
def account():
    user = require_roles(["admin", "staff", "captain", "resident"], True)
    uid = int(user["id"])
    resident = None
    if user["role"] == "resident":
        resident = db.session.execute(select(Resident).where(Resident.user_id == uid).limit(1)).scalar()

    if request.method == "POST":
        csrf_check()
        f = request.form
        action = f.get("action", "")

        if action == "update_profile":
            if resident:
                first, last = (f.get("first_name") or "").strip(), (f.get("last_name") or "").strip()
                address, birth, civil = (f.get("address") or "").strip(), (f.get("birthdate") or "").strip(), (f.get("civil_status") or "").strip()
                if first == "" or last == "":
                    raise ApiError("First name and last name are required.", 422)
                if len(first) > 60 or len(last) > 60 or len(address) > 150:
                    raise ApiError("One of the fields is too long.", 422)
                contact = clean_contact(f.get("contact_no", ""))
                bd = valid_birthdate(birth, oldest="120")
                if civil != "" and civil not in CIVIL_STATUSES:
                    raise ApiError("Please choose a valid civil status.", 422)
                resident.first_name, resident.last_name, resident.address = first, last, address
                resident.birthdate, resident.civil_status, resident.contact_no = bd, civil or None, contact
                full_name = f"{first} {last}"
            else:
                full_name = (f.get("full_name") or "").strip()
                if full_name == "" or len(full_name) > 100:
                    raise ApiError("Please enter your name (100 characters max).", 422)
            db.session.execute(update(User).where(User.id == uid).values(full_name=full_name))
            db.session.commit()
            sess = dict(session["user"]); sess["full_name"] = full_name; session["user"] = sess
            log_activity("Profile updated", "Changed account details")
            return ok()

        if action == "upload_avatar":
            file = request.files.get("photo")
            if not file or not file.filename:
                raise ApiError("Please choose a photo to upload.", 422)
            data = file.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise ApiError("That photo is too large (2 MB maximum).", 422)
            try:
                img = Image.open(io.BytesIO(data))
                kind, size = img.format, img.size
                img.verify()
            except (UnidentifiedImageError, OSError, SyntaxError):
                raise ApiError("Please upload a JPG, PNG, GIF or WEBP picture.", 422)
            if kind not in AVATAR_TYPES:
                raise ApiError("Please upload a JPG, PNG, GIF or WEBP picture.", 422)
            if size[0] > 4000 or size[1] > 4000:
                raise ApiError("That picture is too large (4000 x 4000 pixels maximum).", 422)
            name = f"u{uid}_{secrets.token_hex(6)}.{AVATAR_TYPES[kind]}"  # server-chosen name and extension
            (avatar_dir() / name).write_bytes(data)
            old = db.session.scalar(select(User.avatar).where(User.id == uid)) or ""
            db.session.execute(update(User).where(User.id == uid).values(avatar=name))
            db.session.commit()
            _remove_avatar_file(uid, old)
            log_activity("Profile updated", "Changed profile photo")
            from flask import url_for
            return ok(avatar=url_for("public.avatar_file", filename=name, v=int(datetime.now().timestamp())))

        if action == "remove_avatar":
            old = db.session.scalar(select(User.avatar).where(User.id == uid)) or ""
            db.session.execute(update(User).where(User.id == uid).values(avatar=None))
            db.session.commit()
            _remove_avatar_file(uid, old)
            log_activity("Profile updated", "Removed profile photo")
            return ok()

        if action in ("save_signature", "clear_signature"):
            if user["role"] != "captain":
                raise ApiError("Only the Barangay Captain has a signature.", 403)
            if action == "clear_signature":
                db.session.execute(update(User).where(User.id == uid).values(signature=None))
                db.session.commit()
                log_activity("Signature changed", "Went back to the automatic signature")
                return ok(signature=captain_signature(uid), custom=False)
            data = f.get("signature", "")
            m = re.fullmatch(r"data:image/png;base64,([A-Za-z0-9+/=]+)", data)
            if not m or len(data) > 400000:
                raise ApiError("Please draw or upload your signature (PNG, 300 KB at most).", 422)
            try:
                img = Image.open(io.BytesIO(base64.b64decode(m.group(1), validate=True)))
                kind, size = img.format, img.size
                img.verify()
            except Exception:
                raise ApiError("That signature picture is not valid.", 422)
            if kind != "PNG" or size[0] > 1200 or size[1] > 600:
                raise ApiError("That signature picture is not valid.", 422)
            db.session.execute(update(User).where(User.id == uid).values(signature=data))
            db.session.commit()
            log_activity("Signature changed", "Saved a new signature")
            return ok(signature=data, custom=True)

        if action == "change_password":
            current, new, confirm = f.get("current_password", ""), f.get("new_password", ""), f.get("confirm_password", "")
            from .core import password_hash_of
            if not verify_password(current, password_hash_of(uid)):
                raise ApiError("Your current password is not correct.", 422)
            if len(new) < 8:
                raise ApiError("The new password must be at least 8 characters.", 422)
            if new != confirm:
                raise ApiError("The new passwords do not match.", 422)
            db.session.execute(update(User).where(User.id == uid).values(password_hash=hash_password(new)))
            db.session.commit()
            log_activity("Password changed", "Changed own password")
            return ok()
        raise ApiError("Unknown action", 400)

    activity = rows(db.session.execute(
        select(ActivityLog.action, ActivityLog.detail, ActivityLog.created_at).where(ActivityLog.user_id == uid)
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).limit(5)))
    sig_info = None
    if user["role"] == "captain":
        own = db.session.scalar(select(User.signature).where(User.id == uid)) or ""
        sig_info = {"image": captain_signature(uid), "custom": own != ""}
    res_data = None
    if resident:
        res_data = {"id": resident.id, "first_name": resident.first_name, "last_name": resident.last_name, "address": resident.address,
                    "birthdate": resident.birthdate.strftime("%Y-%m-%d") if resident.birthdate else None,
                    "civil_status": resident.civil_status, "contact_no": resident.contact_no}
    return jsonify({
        "signature": sig_info, "activity": activity, "avatar": avatar_url(uid) or None,
        "user": {"username": user["username"], "full_name": user["full_name"], "position": user["position"], "role": user["role"],
                 "role_label": ROLE_LABELS.get(user["role"], user["role"])},
        "resident": res_data,
    })


# ======================================================================================
#  Residents
# ======================================================================================


@bp.route("/residents", methods=["GET", "POST"])
def residents():
    user = require_staff(True)
    R = Resident
    if request.method == "POST":
        csrf_check()
        f = request.form
        action = f.get("action", "")

        if action == "delete":
            if user["role"] != "admin":
                raise ApiError("Only the administrator can delete a resident.", 403)
            row = db.session.execute(select(R).where(R.id == f.get("id", 0, type=int), R.deleted_at.is_(None))).scalar()
            if not row:
                raise ApiError("Resident not found.", 404)
            try:
                # the resident row stays (hidden) so their documents / complaints keep their name
                row.deleted_at = now()
                if row.user_id:
                    login_id = row.user_id
                    row.user_id = None
                    db.session.flush()
                    db.session.execute(delete(User).where(User.id == login_id, User.role == "resident"))
                db.session.commit()
            except Exception:
                db.session.rollback()
                raise
            return ok()

        if action != "save":
            raise ApiError("Unknown action", 400)
        rid = f.get("id", 0, type=int) or 0
        first, last = (f.get("first_name") or "").strip(), (f.get("last_name") or "").strip()
        address, status = (f.get("address") or "").strip(), f.get("status", "Registered")
        if first == "" or last == "":
            raise ApiError("First name and last name are required.", 422)
        if len(first) > 60 or len(last) > 60 or len(address) > 150:
            raise ApiError("One of the fields is too long.", 422)
        contact = clean_contact(f.get("contact_no", ""))
        if status not in RES_STATUSES:
            raise ApiError("Invalid status.", 422)
        birth = valid_birthdate((f.get("birthdate") or "").strip())
        civil = (f.get("civil_status") or "").strip()
        if civil != "" and civil not in CIVIL_STATUSES:
            raise ApiError("Please choose a valid civil status.", 422)

        if rid > 0:
            row = db.session.get(R, rid)
            if not row:
                raise ApiError("Resident not found.", 404)
            row.first_name, row.last_name, row.address, row.contact_no = first, last, address, contact
            row.status, row.birthdate, row.civil_status = status, birth, civil or None
            acc = db.session.execute(select(User).where(User.id == row.user_id, User.role == "resident")).scalar() if row.user_id else None

            new_user = (f.get("username") or "").strip()
            if new_user != "" and acc and new_user != acc.username:
                if user["role"] != "admin":
                    raise ApiError("Only the administrator can change a resident username.", 403)
                if not re.fullmatch(r"[A-Za-z0-9._]{4,30}", new_user):
                    raise ApiError("Username: use 4 to 30 letters, numbers, dots or underscores.", 422)
                if db.session.scalar(select(func.count()).select_from(User).where(User.username == new_user, User.id != acc.id)):
                    raise ApiError("That username is already taken. Try another one.", 409)
                log_activity("Resident username changed", f"Changed the username of resident account '{acc.username}' to '{new_user}'", commit=False)
                acc.username = new_user
                add_notification(acc.id, "Your username was changed", f"The administrator changed your login username to {new_user}.", "info")

            new_pass = f.get("new_password", "")
            if new_pass != "":
                if user["role"] != "admin":
                    raise ApiError("Only the administrator can change a resident password.", 403)
                if len(new_pass) < 8:
                    raise ApiError("Password must be at least 8 characters.", 422)
                if not acc:
                    raise ApiError("This resident has no online account.", 422)
                acc.password_hash = hash_password(new_pass)
                log_activity("Resident password reset", f"Reset the password of resident account '{acc.username}'", commit=False)
                add_notification(acc.id, "Your password was changed",
                                 "The administrator set a new password for your account. Please change it in Settings > Account & Security.", "info")
            if acc:  # keep the login name in sync
                acc.full_name = f"{first} {last}"
            db.session.commit()
        else:
            db.session.add(R(first_name=first, last_name=last, address=address, contact_no=contact, status=status,
                             birthdate=birth, civil_status=civil or None))
            db.session.commit()
        return ok()

    where = [R.deleted_at.is_(None), R.is_walkin.is_(False)]
    status = request.args.get("status", "")
    if status in RES_STATUSES:
        where.append(R.status == status)
    q = (request.args.get("q") or "").strip()
    if q:
        where.append(or_(full_name_expr().contains(q, autoescape=True), R.address.contains(q, autoescape=True),
                         R.contact_no.contains(q, autoescape=True)))
    page, per = page_args()
    total = db.session.scalar(select(func.count()).select_from(R).where(*where)) or 0

    def cnt(cat):
        return (select(func.count()).select_from(Transaction).join(Service, Service.id == Transaction.service_id)
                .where(Transaction.resident_id == R.id, Service.category == cat).correlate(R).scalar_subquery())

    data = rows(db.session.execute(paged(
        select(R.id, R.user_id, R.first_name, R.last_name, R.address, R.contact_no, R.status, R.created_at, R.birthdate, R.civil_status,
               case((R.user_id.is_not(None), 1), else_=0).label("has_account"),
               select(User.created_at).where(User.id == R.user_id).correlate(R).scalar_subquery().label("account_created"),
               cnt("document").label("doc_count"), cnt("complaint").label("complaint_count"), cnt("report").label("report_count"),
               select(User.username).where(User.id == R.user_id, User.role == "resident").correlate(R).scalar_subquery().label("username"))
        .where(*where).order_by(R.last_name.asc(), R.first_name.asc(), R.id.asc()), page, per)))
    is_admin = user["role"] == "admin"
    for r in data:
        r["avatar"] = avatar_url(r["user_id"]) if r["user_id"] else ""
        del r["user_id"]
        if not is_admin:
            r.pop("username", None)
    return jsonify({"rows": data, "total": total, "page": page, "per_page": per})


@bp.get("/resident_lookup")
def resident_lookup():
    require_staff(True)
    R = Resident
    base = [R.deleted_at.is_(None), R.is_walkin.is_(False)]
    if "addresses" in request.args:
        q = (request.args.get("q") or "").strip()
        addrs = db.session.execute(
            select(R.address).where(*base, R.address != "", R.address.contains(q, autoescape=True))
            .group_by(R.address).order_by(func.count().desc(), R.address).limit(8)).all()
        return jsonify({"addresses": [a[0] for a in addrs]})
    if "id" in request.args:
        r = db.session.execute(select(R).where(R.id == request.args.get("id", 0, type=int), *base)).scalar()
        if not r:
            raise ApiError("That resident record no longer exists.", 404)
        return jsonify({"resident": {
            "id": r.id, "first_name": r.first_name, "last_name": r.last_name, "address": r.address, "contact_no": r.contact_no,
            "birthdate": r.birthdate.strftime("%Y-%m-%d") if r.birthdate else None, "civil_status": r.civil_status,
            "status": r.status, "has_account": 1 if r.user_id else 0, "resident_no": reg_no(r.id)}})
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"rows": [], "q": q})
    data = rows(db.session.execute(
        select(R.id, R.first_name, R.last_name, R.address, R.contact_no, R.status)
        .where(*base, or_(full_name_expr().contains(q, autoescape=True), (R.last_name + " " + R.first_name).contains(q, autoescape=True),
                          R.contact_no.contains(q, autoescape=True)))
        .order_by(case((R.status == "Registered", 0), else_=1), R.last_name, R.first_name).limit(8)))
    count = {}
    for r in data:
        k = f"{r['first_name']} {r['last_name']}".lower()
        count[k] = count.get(k, 0) + 1
    for r in data:
        r["same_name"] = count[f"{r['first_name']} {r['last_name']}".lower()] > 1
    return jsonify({"rows": data, "q": q})


@bp.route("/resident_accounts", methods=["GET", "POST"])
def resident_accounts():
    require_full_access(True)
    if request.method == "POST":
        csrf_check()
        if request.form.get("action", "") != "reset_password":
            raise ApiError("Unknown action", 400)
        uid, password = request.form.get("id", 0, type=int) or 0, request.form.get("password", "")
        if len(password) < 8:
            raise ApiError("Password must be at least 8 characters.", 422)
        row = db.session.execute(select(User).where(User.id == uid, User.role == "resident")).scalar()
        if not row:
            raise ApiError("Resident account not found.", 404)
        row.password_hash = hash_password(password)
        add_notification(uid, "Your password was changed",
                         "The administrator set a new password for your account. Please change it in Settings > Account & Security.", "info")
        db.session.commit()
        log_activity("Resident password reset", f"Reset the password of resident account '{row.username}'")
        return ok()
    where = [User.role == "resident"]
    q = (request.args.get("q") or "").strip()
    if q:
        where.append(or_(User.username.contains(q, autoescape=True), User.full_name.contains(q, autoescape=True)))
    page, per = page_args()
    total = db.session.scalar(select(func.count()).select_from(User).where(*where)) or 0
    last_name = select(Resident.last_name).where(Resident.user_id == User.id).correlate(User).limit(1).scalar_subquery()
    data = rows(db.session.execute(paged(
        select(User.id, User.username, User.full_name, User.created_at).where(*where)
        .order_by(func.coalesce(last_name, User.full_name), User.full_name, User.id), page, per)))
    return jsonify({"rows": data, "total": total, "page": page, "per_page": per})


# ======================================================================================
#  Settings
# ======================================================================================


def _clean_setting(key, raw, user):
    if isinstance(raw, (list, dict)):
        return None
    raw = str(raw).strip()
    if key in ("sidebar_collapsed", "notify_announcements", "notify_requests"):
        return int(raw) if raw in ("0", "1") else None
    if key in ("session_timeout", "page_size"):
        return int(raw) if raw.isdigit() and int(raw) in SETTING_CHOICES[key] else None
    if key == "default_page":
        return raw if raw in default_page_choices(user) else None
    return raw if raw in SETTING_CHOICES.get(key, []) else None


@bp.route("/settings", methods=["GET", "POST"])
def settings():
    user = require_roles(["admin", "staff", "captain", "resident"], True)
    uid = int(user["id"])
    if request.method == "POST":
        csrf_check()
        action = request.form.get("action", "")
        if action == "save":
            clean, errors = {}, []
            for key in SETTING_DEFAULTS:
                if key not in request.form:
                    continue
                v = _clean_setting(key, request.form[key], user)
                if v is None:
                    errors.append(key)
                else:
                    clean[key] = v
            if errors:
                raise ApiError("Some choices are not valid: " + ", ".join(errors) + ".", 422)
            if not clean:
                raise ApiError("Nothing to save.", 422)
            store_settings(uid, clean)
            return jsonify({"ok": True, "settings": {**SETTING_DEFAULTS, **clean}})
        if action == "reset":
            group = request.form.get("group", "")
            if group not in SETTING_GROUPS:
                raise ApiError("Unknown settings group.", 422)
            defaults = {k: SETTING_DEFAULTS[k] for k in SETTING_GROUPS[group]}
            store_settings(uid, defaults)
            return jsonify({"ok": True, "settings": defaults})
        raise ApiError("Unknown action", 400)
    current = dict(get_user_settings(uid))
    choices = default_page_choices(user)
    if current["default_page"] not in choices:
        current["default_page"] = "dashboard"
    return jsonify({"settings": current, "defaults": SETTING_DEFAULTS, "default_pages": choices})


# ======================================================================================
#  Announcements, notifications, activity log
# ======================================================================================


@bp.route("/announcements", methods=["GET", "POST"])
def announcements():
    user = require_roles(["admin", "staff", "captain", "resident"], True)
    if request.method == "POST":
        if not has_permission("post_announcements", user):
            raise ApiError("You do not have permission to post announcements.", 403)
        csrf_check()
        action = request.form.get("action", "")
        if action == "create":
            title, body = (request.form.get("title") or "").strip(), (request.form.get("body") or "").strip()
            if title == "" or body == "":
                raise ApiError("Title and message are required.", 422)
            if len(title) > 150:
                raise ApiError("Title is too long (150 characters max).", 422)
            db.session.add(Announcement(posted_by=user["id"], title=title, body=body))
            try:  # tell everyone else, except people who turned announcement notifications off
                off = {r[0] for r in db.session.execute(select(UserSetting.user_id).where(UserSetting.notify_announcements == 0))}
                for (uid,) in db.session.execute(select(User.id).where(User.id != user["id"])):
                    if uid not in off:
                        db.session.add(Notification(user_id=uid, title="New announcement", message=title[:250], type="info"))
            except Exception:
                pass
            db.session.commit()
            return ok()
        if action == "delete":
            db.session.execute(delete(Announcement).where(Announcement.id == request.form.get("id", 0, type=int)))
            db.session.commit()
            return ok()
        raise ApiError("Unknown action", 400)
    data = rows(db.session.execute(
        select(Announcement.id, Announcement.title, Announcement.body, Announcement.created_at, User.full_name.label("posted_by"))
        .join(User, User.id == Announcement.posted_by).order_by(Announcement.created_at.desc(), Announcement.id.desc()).limit(50)))
    return jsonify({"rows": data})


@bp.route("/notifications", methods=["GET", "POST"])
def notifications():
    user = require_roles(["admin", "staff", "captain", "resident"], True)
    uid = int(user["id"])
    N = Notification
    if request.method == "POST":
        csrf_check()
        action = request.form.get("action", "")
        nid = request.form.get("id", 0, type=int) or 0
        if action == "read":
            db.session.execute(update(N).where(N.id == nid, N.user_id == uid).values(is_read=1))
        elif action == "read_all":
            db.session.execute(update(N).where(N.user_id == uid).values(is_read=1))
        elif action == "delete":
            db.session.execute(delete(N).where(N.id == nid, N.user_id == uid))
        else:
            raise ApiError("Unknown action", 400)
        db.session.commit()
        return ok(unread=unread_count(uid))
    if "summary" in request.args:
        out = {"unread": unread_count(uid)}
        if user["role"] == "captain":
            out["pending_approvals"] = db.session.scalar(
                select(func.count()).select_from(Transaction).join(Service, Service.id == Transaction.service_id).where(_awaiting_signature())) or 0
        return jsonify(out)
    where = [N.user_id == uid]
    if request.args.get("unread") == "1":
        where.append(N.is_read == 0)
    page, per = page_args()
    total = db.session.scalar(select(func.count()).select_from(N).where(*where)) or 0
    data = rows(db.session.execute(paged(
        select(N.id, N.title, N.message, N.type, N.is_read, N.created_at).where(*where).order_by(N.created_at.desc(), N.id.desc()), page, per)))
    return jsonify({"rows": data, "total": total, "page": page, "per_page": per, "unread": unread_count(uid)})


@bp.get("/activity_log")
def activity_log():
    require_full_access(True)
    A = ActivityLog
    where = []
    q = (request.args.get("q") or "").strip()
    if q:
        where.append(or_(A.username.contains(q, autoescape=True), A.action.contains(q, autoescape=True), A.detail.contains(q, autoescape=True)))
    page, per = page_args()
    total = db.session.scalar(select(func.count()).select_from(A).where(*where)) or 0
    data = rows(db.session.execute(paged(
        select(A.id, A.username, A.action, A.detail, A.created_at).where(*where).order_by(A.created_at.desc(), A.id.desc()), page, per)))
    return jsonify({"rows": data, "total": total, "page": page, "per_page": per})


# ======================================================================================
#  Reports + CSV export
# ======================================================================================


def _range_from_request():
    to = valid_date(request.args.get("to", "")) or date.today().strftime("%Y-%m-%d")
    frm = valid_date(request.args.get("from", "")) or (parse_date(to) - timedelta(days=29)).strftime("%Y-%m-%d")
    if frm > to:
        frm, to = to, frm
    return parse_date(frm), parse_date(to)


@bp.get("/reports_summary")
def reports_summary():
    require_permission("view_reports", True)
    frm, to = _range_from_request()
    if (to - frm).days > 366:
        frm = to - timedelta(days=366)
    days = (to - frm).days + 1
    t = Transaction
    rng = [day_range(frm, to), t.status != "Inactive"]

    totals = dict(total=0, documents=0, complaints=0, reports=0, completed=0, rejected=0)
    for cat, status, n in db.session.execute(
        select(Service.category, t.status, func.count()).select_from(t).join(Service, Service.id == t.service_id)
        .where(*rng).group_by(Service.category, t.status)):
        n = int(n)
        totals["total"] += n
        totals[{"document": "documents", "complaint": "complaints", "report": "reports"}[cat]] += n
        if status in ("Released", "Resolved"):
            totals["completed"] += n
        if status == "Rejected":
            totals["rejected"] += n

    by_status = rows(db.session.execute(
        select(t.status, func.count().label("total")).where(*rng).group_by(t.status).order_by(status_sort(t.status))))
    by_service = rows(db.session.execute(
        select(Service.name, Service.category, func.count().label("total")).select_from(t).join(Service, Service.id == t.service_id)
        .where(*rng).group_by(Service.id, Service.name, Service.category).order_by(func.count().desc(), Service.name).limit(10)))

    created = [r[0] for r in db.session.execute(select(t.created_at).where(*rng))]
    series = []
    if days <= 62:
        counts = {}
        for c in created:
            counts[c.date()] = counts.get(c.date(), 0) + 1
        d = frm
        while d <= to:
            series.append({"label": d.strftime("%b ") + str(d.day), "total": counts.get(d, 0)})
            d += timedelta(days=1)
        grain = "day"
    else:
        counts = {}
        for c in created:
            counts[(c.year, c.month)] = counts.get((c.year, c.month), 0) + 1
        y, m = frm.year, frm.month
        while (y, m) <= (to.year, to.month):
            series.append({"label": date(y, m, 1).strftime("%b %Y"), "total": counts.get((y, m), 0)})
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        grain = "month"
    return jsonify({"from": frm.strftime("%Y-%m-%d"), "to": to.strftime("%Y-%m-%d"), "totals": totals,
                    "by_status": by_status, "by_service": by_service, "series": series, "grain": grain})


def _csv_safe(value) -> str:
    value = "" if value is None else str(value)
    return "'" + value if value and value[0] in "=+-@\t\r" else value


@bp.get("/export_transactions")
def export_transactions():
    require_permission("view_reports", True)
    frm, to = _range_from_request()
    t = Transaction
    data = db.session.execute(
        tx_join(select(t.tracking_no, Service.name, Service.category, full_name_expr(), t.status, t.created_at, t.updated_at))
        .where(day_range(frm, to)).order_by(t.created_at.desc()))
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(["Tracking No.", "Service", "Category", "Resident", "Status", "Date Filed", "Last Updated"])
    for r in data:
        w.writerow([_csv_safe(fmt) for fmt in (v.strftime("%Y-%m-%d %H:%M:%S") if isinstance(v, datetime) else v for v in r)])
    body = "\ufeff" + buf.getvalue()  # UTF-8 marker so Excel shows names correctly
    return Response(body, mimetype="text/csv", headers={
        "Content-Disposition": f'attachment; filename="transactions_{frm:%Y-%m-%d}_to_{to:%Y-%m-%d}.csv"'})


# ======================================================================================
#  Auto-filled certificate as a PDF (ReportLab)
# ======================================================================================


@bp.get("/certificate/<int:tx_id>.pdf")
def certificate_pdf(tx_id):
    """Server-side PDF of a document request, filled from the saved request details (staff, admin, captain)."""
    require_staff(True)
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    t = db.session.get(Transaction, tx_id)
    if not t or t.service.category != "document":
        raise ApiError("Document not found.", 404)
    res = t.resident
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    c.setFont("Helvetica", 10)
    c.drawCentredString(w / 2, h - 60, "Republic of the Philippines")
    c.drawCentredString(w / 2, h - 74, "Barangay Sample, Sample City")
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(w / 2, h - 130, t.service.name.upper())
    c.setFont("Helvetica", 12)
    y = h - 190
    c.drawString(60, y, "TO WHOM IT MAY CONCERN:")
    y -= 30
    c.drawString(60, y, f"This certifies that {res.first_name} {res.last_name}, of {res.address or 'this barangay'},")
    y -= 18
    c.drawString(60, y, "is a resident of this barangay and has requested this document.")
    y -= 36
    for line in (t.details or "").splitlines():
        c.drawString(70, y, line[:95])
        y -= 16
    y -= 20
    c.drawString(60, y, f"Reference No.: {t.tracking_no}")
    c.drawString(60, y - 16, f"Date issued: {date.today():%B %d, %Y}")
    if t.signed_at:
        sig = t.signature_snapshot or captain_signature(int(t.signed_by or 0))
        try:
            if sig.startswith("data:image/png"):
                c.drawImage(ImageReader(io.BytesIO(base64.b64decode(sig.split(",", 1)[1]))), w - 260, 140, width=180, height=60, mask="auto")
        except Exception:
            pass  # automatic (SVG) signatures appear in the browser print view
        c.line(w - 270, 135, w - 60, 135)
        c.drawCentredString(w - 165, 120, t.signed_by_name or "")
        c.setFont("Helvetica", 9)
        c.drawCentredString(w - 165, 107, "Punong Barangay")
    c.showPage()
    c.save()
    return Response(buf.getvalue(), mimetype="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{t.tracking_no}.pdf"'})
