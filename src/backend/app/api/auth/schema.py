from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

BusinessType = Literal["katering", "warung", "rumah_makan"]
PlanType = Literal["freemium", "pro"]


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    business_name: str = Field(..., min_length=2, max_length=150)
    business_type: BusinessType
    city: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=30)
    plan: Optional[PlanType] = "freemium"
    payment_method: Optional[str] = None
    seed_demo: Optional[bool] = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    pro_until: Optional[date] = None
    business_name: str
    business_type: str
    city: Optional[str] = None
    phone: Optional[str] = None
    created_at: Optional[datetime] = None


class RefreshTokenResponse(BaseModel):
    message: str = "Access token berhasil diperbarui"
