"""Document workflow: staff approve -> (sent to the captain) -> captain signs -> staff release,
and the shared document application form rules (residents and staff file the same form)."""
import re
from datetime import date, datetime

from flask import request
from sqlalchemy import select, update

from .core import (
    ApiError, add_notification, avatar_url, captain_signature, captain_term_ended, notify_role, squash,
)
from .models import ActivityLog, Resident, Service, Transaction, User, db, now

CIVIL_STATUSES = ["Single", "Married", "Widowed", "Separated"]
SEX_OPTIONS = ["Male", "Female"]
DOC_PURPOSES = [
    "Employment", "School enrollment", "Identification", "Financial assistance", "Travel",
    "Business / permit", "Other lawful purpose", "Others",
]


def statuses_for(category: str) -> list:
    return ["Pending", "Approved", "Released"] if category == "document" else ["Under Review", "Resolved", "Rejected"]


# --------------------------------------------------------------------------------------
#  Application form (same rules for residents and for staff filing at the hall)
# --------------------------------------------------------------------------------------


def resolve_purpose(purpose: str, other: str) -> str:
    """When "Others" / "Other lawful purpose" is picked the typed purpose is what gets saved."""
    if re.match(r"(?i)^other", purpose):
        if other == "":
            raise ApiError("Please type your purpose of request.", 422)
        if len(other) > 100:
            raise ApiError("Your purpose is too long (100 characters max).", 422)
        return other
    return purpose


def _real_date(s: str):
    try:
        d = datetime.strptime(s, "%Y-%m-%d").date()
        return d if d.strftime("%Y-%m-%d") == s else None
    except (ValueError, TypeError):
        return None


def build_document_details(resident: dict, service_name: str) -> str:
    """Validate the fill-up form (request.form) and return the labeled lines that are saved."""
    def clean(k):
        return squash(request.form.get(k, ""))

    first, middle, last = clean("first_name"), clean("middle_name"), clean("last_name")
    if first or last:                                   # the form asks for the three parts
        if first == "" or last == "":
            raise ApiError("Please enter your first name and last name.", 422)
        if max(len(first), len(middle), len(last)) > 60:
            raise ApiError("A name is too long (60 characters max).", 422)
        name = " ".join(p for p in (first, middle, last) if p)
    else:
        name = clean("full_name") or " ".join(p for p in (resident.get("first_name", ""), resident.get("middle_name", ""), resident.get("last_name", "")) if p)
    contact = clean("contact_number")
    if name == "" or len(name) > 150:
        raise ApiError("Please enter your full name.", 422)
    contact = re.sub(r"\D+", "", contact)
    if contact == "" or len(contact) > 11:
        raise ApiError("Please enter a valid contact number (11 digits maximum).", 422)

    lines = [f"Document Type: {service_name}", f"Full Name: {name}"]
    if first or last:
        lines += [f"First Name: {first}", f"Middle Name: {middle}" if middle else "Middle Name: None", f"Last Name: {last}"]
    if service_name in ("Business Permit Request", "Business Permit"):
        owner, business, address = clean("owner_name"), clean("business_name"), clean("business_address")
        btype, nature, app_type = clean("business_type"), clean("nature_of_business"), clean("application_type")
        if "" in (owner, business, address, btype, nature) or app_type not in ("New Business", "Renewal"):
            raise ApiError("Please complete all required business permit fields.", 422)
        lines = [
            f"Document Type: {service_name}", f"Owner's Name: {owner}", f"Business Name: {business}",
            f"Business Address: {address}", f"Business Type: {btype}", f"Nature of Business: {nature}",
            f"Application Type: {app_type}", f"Contact Number: {contact}",
        ]
    else:
        address = clean("complete_address")
        if address == "" or len(address) > 250:
            raise ApiError("Please enter your complete address (250 characters max).", 422)
        lines.append(f"Complete Address: {address}")
        if service_name == "Certificate of Indigency":
            occupation, income = clean("occupation"), clean("monthly_income")
            members, purpose = clean("household_members"), clean("purpose")
            if occupation == "" or not re.fullmatch(r"[0-9]+", members or "x") or int(members or 0) < 1 or purpose == "":
                raise ApiError("Please complete the required indigency fields.", 422)
            lines.append(f"Occupation / Employment Status: {occupation}")
            lines.append("Approximate Monthly Household Income (PHP): " + (income if income != "" else "Not provided"))
            lines.append(f"Number of Household Members: {members}")
            lines.append("Purpose of Request: " + resolve_purpose(purpose, clean("purpose_other")))
        else:
            birth = clean("birth_date")
            bd = _real_date(birth)
            if not bd or bd > date.today() or bd < date(1900, 1, 1):
                raise ApiError("Please enter a valid date of birth.", 422)
            civil = clean("civil_status")
            if civil not in CIVIL_STATUSES:
                raise ApiError("Please choose a valid civil status.", 422)
            lines.append(f"Date of Birth: {birth}")
            lines.append(f"Civil Status: {civil}")
            if service_name in ("Barangay Clearance", "Certificate of Residency"):
                start = clean("residency_start")
                if start == "":
                    raise ApiError("Please enter when you started residing in the barangay.", 422)
                lines.append(f"Year or Date You Started Residing in the Barangay: {start}")
            purpose = clean("purpose")
            if purpose == "":
                raise ApiError("Please choose the purpose of the request.", 422)
            lines.append("Purpose of Request: " + resolve_purpose(purpose, clean("purpose_other")))
        lines.append(f"Contact Number: {contact}")
    remarks = (request.form.get("remarks") or "").strip()
    if remarks:
        lines.append("Remarks: " + remarks[:500])
    return "\n".join(lines)


# --------------------------------------------------------------------------------------
#  Staff step on ONE document (approve / release), one database transaction each
# --------------------------------------------------------------------------------------


def _log(user_id, username, action, detail):
    db.session.add(ActivityLog(
        user_id=user_id, username=str(username)[:50], action=action[:60], detail=detail[:255],
        ip=(request.remote_addr or "")[:45],
    ))


def staff_document_step(tx_id: int, staff: dict, step: str) -> dict:
    """``step`` = 'approve' (Pending -> Approved, forwarded to the captain automatically)
    or 'release' (Approved AND signed by the captain -> Released).

    The UPDATE only matches the expected current state, so a double click / second tab changes nothing
    the second time and reports a conflict. Returns {'ok': True, 'tracking_no': ...} or {'error', 'code'}.
    """
    row = db.session.execute(
        select(Transaction.tracking_no, Transaction.status, Transaction.endorsed_at, Transaction.signed_at,
               Transaction.released_at, Service.category, Service.name.label("service"), Resident.user_id)
        .join(Service, Service.id == Transaction.service_id)
        .join(Resident, Resident.id == Transaction.resident_id)
        .where(Transaction.id == tx_id)
    ).first()
    if not row or row.category != "document":
        return {"error": "Document not found.", "code": 404}

    t = Transaction
    stamp = now()
    uid = int(staff["id"])
    if step == "approve":
        cond = (t.id == tx_id, t.status == "Pending", t.endorsed_at.is_(None))
        vals = dict(status="Approved", approved_at=stamp, approved_by=uid, endorsed_at=stamp, endorsed_by=uid)
        label, note = "Document approved", "approved, sent to the Captain for signing"
    else:
        cond = (t.id == tx_id, t.status == "Approved", t.signed_at.is_not(None), t.released_at.is_(None))
        vals = dict(status="Released", released_at=stamp, released_by=uid)
        label, note = "Document released", "released"

    try:
        res = db.session.execute(update(t).where(*cond).values(**vals))
        if res.rowcount != 1:
            db.session.rollback()
            if step == "approve":
                why = "It was already released." if row.status == "Released" else "It was already approved and sent to the Barangay Captain."
                return {"error": f"{row.tracking_no} cannot be approved. {why}", "code": 409}
            if row.status == "Released":
                why = "It was already released."
            elif row.status == "Approved" and not row.signed_at:
                why = "It is still waiting for the Barangay Captain's signature."
            else:
                why = "It must be approved and signed by the Barangay Captain first."
            return {"error": f"{row.tracking_no} cannot be released. {why}", "code": 409}

        _log(uid, staff["username"], label, f"{row.tracking_no} ({row.service}) - {note}")
        if row.user_id:
            if step == "approve":
                add_notification(row.user_id, "Document approved",
                                 f"Your request {row.tracking_no} was approved and sent to the Barangay Captain for signing.",
                                 "info", "requests")
            else:
                add_notification(row.user_id, "Document released",
                                 f"Your request {row.tracking_no} was released. You may now claim it at the barangay hall.",
                                 "success", "requests")
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return {"ok": True, "tracking_no": row.tracking_no}


def sign_documents(ids, signer_id: int, signer_username: str = "") -> int:
    """The captain signs documents staff approved. Status stays Approved; staff then release them.
    The signature as it is TODAY is stored on each document, so a later captain never changes earlier ones."""
    ids = sorted({int(i) for i in ids if str(i).lstrip("-").isdigit() and int(i) > 0})
    if not ids or captain_term_ended(signer_id):
        return 0
    signer = db.session.get(User, signer_id)
    signer_name = signer.full_name if signer else ""
    signer_sig = captain_signature(signer_id)
    done = 0
    t = Transaction
    try:
        for tx_id in ids:
            svc_ids = select(Service.id).where(Service.category == "document")
            res = db.session.execute(
                update(t).where(
                    t.id == tx_id, t.status == "Approved", t.endorsed_at.is_not(None), t.signed_at.is_(None),
                    t.released_at.is_(None), t.service_id.in_(svc_ids),
                ).values(signed_by=signer_id, signed_at=now(), signed_by_name=signer_name, signature_snapshot=signer_sig)
            )
            if res.rowcount == 1:
                done += 1
                info = db.session.execute(
                    select(Resident.user_id, Transaction.tracking_no)
                    .join(Resident, Resident.id == Transaction.resident_id).where(Transaction.id == tx_id)
                ).first()
                _log(signer_id, signer_username, "Document signed",
                     f"{info.tracking_no} (signed by the Captain, sent back to staff for release)")
                if info.user_id:
                    add_notification(info.user_id, "Document signed",
                                     f"Your request {info.tracking_no} was signed by the Barangay Captain and is being prepared for release.",
                                     "info", "requests")
        if done:
            notify_role("staff", "Document ready for release",
                        "The Barangay Captain signed a document. It is ready for you to release." if done == 1
                        else f"The Barangay Captain signed {done} documents. They are ready for you to release.", "success")
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return done
