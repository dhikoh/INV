"""
OMNICAT ENTERPRISE - RBAC & AUTHENTICATION SERVICE
Implements 4-role access control (SUPER_ADMIN, FINANCE, SALES, MANAGEMENT_VIEWER),
multi-brand tenant access (user_brand_access), cryptographic Telegram Mini App (TMA)
HMAC-SHA256 verification, and JWT session token generation.
"""

import os
import time
import json
import hmac
import hashlib
import urllib.parse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import jwt

from backend.database import db
from backend.models import TokenClaims, TelegramAuthResult

DEFAULT_JWT_SECRET = os.environ.get("OMNICAT_JWT_SECRET", "omnicat-enterprise-distribution-secret-key-2026")
JWT_ALGORITHM = "HS256"

VALID_ROLES = ("SUPER_ADMIN", "FINANCE", "SALES", "MANAGEMENT_VIEWER")

class RbacService:
    def __init__(self, database=None, jwt_secret: str = DEFAULT_JWT_SECRET):
        self.db = database or db
        self.jwt_secret = jwt_secret

    def generate_token(self, user_id: str, expires_in_seconds: int = 86400) -> str:
        """Generates a signed JWT session token with embedded user claims and brand permissions."""
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 1. Fetch User Data
            cur.execute("""
                SELECT id, username, full_name, role, telegram_user_id, is_active
                FROM users WHERE id = ?
            """, (user_id,))
            user = cur.fetchone()
            if not user:
                raise ValueError(f"User dengan ID '{user_id}' tidak ditemukan.")

            if not user["is_active"]:
                raise PermissionError("Akun pengguna ini telah dinonaktifkan oleh administrator.")

            # 2. Fetch Assigned Brands
            cur.execute("SELECT brand_id FROM user_brand_access WHERE user_id = ?", (user_id,))
            brand_access = [r["brand_id"] for r in cur.fetchall()]

            # If user is SUPER_ADMIN, grant universal access to all active brands
            if user["role"] == "SUPER_ADMIN" and not brand_access:
                cur.execute("SELECT id FROM brands WHERE is_active = 1")
                brand_access = [r["id"] for r in cur.fetchall()]

            now_ts = int(time.time())
            exp_ts = now_ts + expires_in_seconds

            payload = {
                "sub": user["id"],
                "username": user["username"],
                "full_name": user["full_name"],
                "role": user["role"],
                "brand_access": brand_access,
                "telegram_user_id": user["telegram_user_id"],
                "iat": now_ts,
                "exp": exp_ts
            }

            return jwt.encode(payload, self.jwt_secret, algorithm=JWT_ALGORITHM)
        finally:
            conn.close()

    def verify_token(self, token_str: str) -> TokenClaims:
        """Decodes and validates a JWT token string into typed TokenClaims."""
        try:
            payload = jwt.decode(token_str, self.jwt_secret, algorithms=[JWT_ALGORITHM])
            return TokenClaims(
                user_id=payload["sub"],
                username=payload["username"],
                full_name=payload["full_name"],
                role=payload["role"],
                brand_access=payload.get("brand_access", []),
                telegram_user_id=payload.get("telegram_user_id"),
                exp=payload.get("exp", 0),
                iat=payload.get("iat", 0)
            )
        except jwt.ExpiredSignatureError:
            raise PermissionError("Sesi token login telah kadaluarsa. Silakan login kembali.")
        except jwt.InvalidTokenError as e:
            raise PermissionError(f"Token otentikasi tidak valid: {str(e)}")

    def check_permission(self, claims: TokenClaims, allowed_roles: tuple) -> bool:
        """Verifies if user role is within allowed roles."""
        if claims.role not in allowed_roles:
            raise PermissionError(
                f"Akses ditolak: Peran '{claims.role}' tidak memiliki izin untuk operasi ini. "
                f"Dibutuhkan: {', '.join(allowed_roles)}."
            )
        return True

    def check_brand_access(self, claims: TokenClaims, brand_id: str) -> bool:
        """Verifies if user has permission to access a specific brand tenant."""
        if claims.role == "SUPER_ADMIN":
            return True
        if brand_id not in claims.brand_access:
            raise PermissionError(f"Akses ditolak: Pengguna tidak memiliki akses ke brand profile '{brand_id}'.")
        return True

    def can_view_financials(self, claims: TokenClaims) -> bool:
        """Returns True if role is authorized to see confidential HPP/margin."""
        return claims.role in ("SUPER_ADMIN", "FINANCE", "MANAGEMENT_VIEWER")

    def can_approve_orders(self, claims: TokenClaims, brand_id: str) -> bool:
        """Returns True if role has approval authority for the brand."""
        if claims.role in ("SUPER_ADMIN", "FINANCE"):
            return self.check_brand_access(claims, brand_id)
        return False

    def validate_telegram_init_data(
        self,
        init_data_str: str,
        bot_token: str,
        max_age_seconds: int = 86400
    ) -> TelegramAuthResult:
        """
        Validates Telegram WebApp initData query string using HMAC-SHA256 signature verification.
        Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
        """
        if not init_data_str or not init_data_str.strip():
            return TelegramAuthResult(is_valid=False, rejection_reason="Data initData Telegram kosong.")

        parsed_data = dict(urllib.parse.parse_qsl(init_data_str, keep_blank_values=True))
        received_hash = parsed_data.pop("hash", None)

        if not received_hash:
            return TelegramAuthResult(is_valid=False, rejection_reason="Hash kriptografi tidak ditemukan dalam initData.")

        # 1. Check Auth Date Freshness
        auth_date_str = parsed_data.get("auth_date")
        if not auth_date_str or not auth_date_str.isdigit():
            return TelegramAuthResult(is_valid=False, rejection_reason="Format auth_date tidak valid.")

        auth_timestamp = int(auth_date_str)
        current_timestamp = int(time.time())
        if (current_timestamp - auth_timestamp) > max_age_seconds:
            return TelegramAuthResult(is_valid=False, rejection_reason="Data otentikasi Telegram telah kadaluarsa (>24 jam).")

        # 2. Build Data-Check-String (sorted alphabetically: k=v\n)
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))

        # 3. Secret key = HMAC_SHA256(key="WebAppData", msg=bot_token)
        secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()

        # 4. Computed hash = HMAC_SHA256(key=secret_key, msg=data_check_string)
        computed_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

        # Constant-time comparison
        if not hmac.compare_digest(computed_hash, received_hash):
            return TelegramAuthResult(is_valid=False, rejection_reason="Tanda tangan kriptografi Telegram tidak valid (Data diubah/spoofing).")

        # 5. Extract Telegram User
        user_json_str = parsed_data.get("user")
        if not user_json_str:
            return TelegramAuthResult(is_valid=False, rejection_reason="Data profil user tidak ditemukan dalam initData.")

        try:
            tg_user = json.loads(user_json_str)
            tg_id = tg_user.get("id")
        except Exception:
            return TelegramAuthResult(is_valid=False, rejection_reason="Gagal mem-parsing payload JSON user.")

        # 6. Resolve or Map OmniCat User
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT id, username, role, is_active
                FROM users WHERE telegram_user_id = ?
            """, (tg_id,))
            user_row = cur.fetchone()

            # If user not linked by telegram_user_id, link to sales user by default for testing / first login
            if not user_row:
                cur.execute("SELECT id, username, role FROM users WHERE role = 'SALES' LIMIT 1")
                user_row = cur.fetchone()
                if user_row:
                    cur.execute("UPDATE users SET telegram_user_id = ? WHERE id = ?", (tg_id, user_row["id"]))

            if not user_row:
                return TelegramAuthResult(is_valid=False, rejection_reason=f"Akun Telegram {tg_id} belum terdaftar di sistem.")

            # Issue session token
            session_token = self.generate_token(user_row["id"])

            return TelegramAuthResult(
                is_valid=True,
                user_id=user_row["id"],
                username=user_row["username"],
                role=user_row["role"],
                token=session_token
            )
        finally:
            conn.close()

