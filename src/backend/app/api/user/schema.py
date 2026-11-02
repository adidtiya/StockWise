from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

BusinessType = Literal["katering", "warung", "rumah_makan"]


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    email: Optional[EmailStr] = None
    business_name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    business_type: Optional[BusinessType] = None
    city: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=30)


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: Optional[str] = None
    current: Optional[str] = None
    next: Optional[str] = None


class DeleteAccountRequest(BaseModel):
    password: Optional[str] = None
    confirm: Optional[str] = None

