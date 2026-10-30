from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.exceptions import BadRequestException, ProPlanRequiredException
from app.api.forecast.use_cases import ForecastUseCase
from app.api.standard_response import create_success_response
from app.models.user_model import User

router = APIRouter()


async def validate_forecast_params(
    days: int = Query(default=7, description="Horizon: 7, 14, atau 30"),
    view: str = Query(default="bahan", description="Tampilan: bahan atau produk"),
    current_user: User = Depends(get_current_user),
) -> tuple[int, str, User]:
    if days not in (7, 14, 30):
        raise BadRequestException("Parameter days harus bernilai 7, 14, atau 30", status_code=422)
    if days > 7 and current_user.role != "pro":
        raise ProPlanRequiredException("Peramalan 14 dan 30 hari hanya tersedia pada paket Pro")
    if view not in ("bahan", "produk"):
        raise BadRequestException("Parameter view harus bernilai bahan atau produk", status_code=422)
    return days, view, current_user


@router.get("")
async def get_forecast(
    params: tuple[int, str, User] = Depends(validate_forecast_params),
    db: AsyncSession = Depends(get_db),
):
    days, view, current_user = params
    data = await ForecastUseCase(db).execute(current_user, days=days, view=view)
    return create_success_response(data)
