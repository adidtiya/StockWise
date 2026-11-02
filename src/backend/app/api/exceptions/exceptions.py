from __future__ import annotations

from typing import Optional


class CustomException(Exception):
    status_code: int = 400
    default_message: str = "Terjadi kesalahan pada permintaan"

    def __init__(
        self,
        message: Optional[str] = None,
        *,
        status_code: Optional[int] = None,
        code: Optional[str] = None,
        headers: Optional[dict[str, str]] = None,
    ) -> None:
        self.status_code = status_code if status_code is not None else self.__class__.status_code
        self.code = code or self.__class__.__name__
        self.message = message or self.__class__.default_message
        self.headers = headers
        super().__init__(self.message)


class BadRequestException(CustomException):
    status_code = 400
    default_message = "Permintaan tidak valid"


class InvalidCredentialsException(CustomException):
    status_code = 401
    default_message = "Email atau kata sandi yang Anda masukkan salah"


class NotAuthenticatedException(CustomException):
    status_code = 401
    default_message = "Sesi Anda telah berakhir, silakan login kembali"


class InvalidRefreshTokenException(CustomException):
    status_code = 401
    default_message = "Sesi refresh token tidak valid atau telah kedaluwarsa, silakan login kembali"


class InvalidCurrentPasswordException(CustomException):
    status_code = 400
    default_message = "Kata sandi saat ini tidak cocok"


class ProPlanRequiredException(CustomException):
    status_code = 403
    default_message = "Fitur ini hanya tersedia untuk pengguna paket Pro"


class FreemiumQuotaExceededException(CustomException):
    status_code = 403
    default_message = "Batas transaksi bulanan paket Freemium telah tercapai. Silakan tingkatkan ke paket Pro."


class UserNotFoundException(CustomException):
    status_code = 404
    default_message = "Pengguna tidak ditemukan"


class IngredientNotFoundException(CustomException):
    status_code = 404
    default_message = "Bahan baku tidak ditemukan"


class ProductNotFoundException(CustomException):
    status_code = 404
    default_message = "Produk atau menu tidak ditemukan"


class BatchNotFoundException(CustomException):
    status_code = 404
    default_message = "Batch stok tidak ditemukan"


class SaleNotFoundException(CustomException):
    status_code = 404
    default_message = "Transaksi penjualan tidak ditemukan"


class WasteLogNotFoundException(CustomException):
    status_code = 404
    default_message = "Catatan limbah tidak ditemukan"


class EventNotFoundException(CustomException):
    status_code = 404
    default_message = "Event hari khusus tidak ditemukan"


class ProviderNotFoundException(CustomException):
    status_code = 404
    default_message = "Penyedia integrasi tidak dikenal"


class EmailAlreadyRegisteredException(CustomException):
    status_code = 409
    default_message = "Email sudah terdaftar di sistem"


class IntegrationNotConnectedException(CustomException):
    status_code = 409
    default_message = "Layanan pihak ketiga belum terhubung. Hubungkan akun terlebih dahulu."


class InvalidImportDataException(CustomException):
    status_code = 422
    default_message = "Data impor tidak valid"


class InsufficientHistoryException(CustomException):
    status_code = 422
    default_message = "Riwayat transaksi penjualan belum mencukupi untuk melakukan peramalan (minimal 14 hari riwayat aktif)"


class RateLimitExceededException(CustomException):
    status_code = 429
    default_message = "Batas permintaan per menit terlampaui. Silakan tunggu beberapa saat."

    def __init__(
        self,
        message: Optional[str] = None,
        *,
        retry_after: int = 60,
        headers: Optional[dict[str, str]] = None,
    ) -> None:
        merged_headers = {"Retry-After": str(retry_after)}
        if headers:
            merged_headers.update(headers)
        super().__init__(message, headers=merged_headers)


class DatabaseUnavailableException(CustomException):
    status_code = 503
    default_message = "Tidak dapat terhubung ke database PostgreSQL"

