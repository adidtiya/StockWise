from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.depedencies import get_current_user, get_db
from app.api.sale.schema import (
    SaleCreateRequest,
    SaleCreateResponse,
    SaleHistoryResponse,
    SaleImportExcelResponse,
    SaleImportJsonRequest,
    SaleListResponse,
)
from app.api.sale.use_cases import SaleUseCases
from app.api.standard_response import StandardResponse, create_success_response
from app.models.user_model import User

router = APIRouter()


@router.get(
    "",
    response_model=StandardResponse[SaleListResponse],
    status_code=status.HTTP_200_OK,
    summary="Daftar transaksi penjualan pengguna",
)
async def list_sales(
    start_date: Optional[date] = Query(default=None, description="Filter tanggal awal"),
    end_date: Optional[date] = Query(default=None, description="Filter tanggal akhir"),
    from_date: Optional[date] = Query(default=None, alias="from", description="Alias tanggal awal"),
    to_date: Optional[date] = Query(default=None, alias="to", description="Alias tanggal akhir"),
    source: Optional[str] = Query(default=None, description="Filter sumber transaksi"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SaleListResponse]:
    use_cases = SaleUseCases(db)
    data = await use_cases.list_sales(
        current_user.id,
        start_date=start_date or from_date,
        end_date=end_date or to_date,
        source=source,
        limit=limit,
        offset=offset,
    )
    return create_success_response(data=data)


@router.get(
    "/template",
    status_code=status.HTTP_200_OK,
    summary="Unduh berkas template Excel penjualan (.xlsx)",
)
async def download_sales_template(
    db: AsyncSession = Depends(get_db),
) -> Response:
    use_cases = SaleUseCases(db)
    xlsx_bytes = use_cases.generate_excel_template()
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="template-penjualan-stockwise.xlsx"'
        },
    )


@router.get(
    "/history",
    response_model=StandardResponse[SaleHistoryResponse],
    status_code=status.HTTP_200_OK,
    summary="Tinjau dataset riwayat transaksi historis bersih (data latih model)",
)
async def get_sales_history(
    history_type: str = Query(default="sales", alias="type", description="Jenis riwayat: sales | stock | waste"),
    start_date: Optional[date] = Query(default=None, description="Filter tanggal mulai"),
    end_date: Optional[date] = Query(default=None, description="Filter tanggal akhir"),
    from_date: Optional[date] = Query(default=None, alias="from", description="Alias tanggal mulai"),
    to_date: Optional[date] = Query(default=None, alias="to", description="Alias tanggal akhir"),
    source: Optional[str] = Query(default="all", description="Filter sumber transaksi"),
    limit: int = Query(default=500, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SaleHistoryResponse]:
    use_cases = SaleUseCases(db)
    data = await use_cases.get_training_history(
        current_user.id,
        history_type=history_type,
        start_date=start_date or from_date,
        end_date=end_date or to_date,
        source=source,
        limit=limit,
        offset=offset,
    )
    return create_success_response(data=data)


@router.post(
    "",
    response_model=StandardResponse[SaleCreateResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Catat transaksi penjualan harian manual & mutasi stok FEFO",
)
async def create_sale(
    payload: SaleCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SaleCreateResponse]:
    use_cases = SaleUseCases(db)
    data = await use_cases.create_sale(current_user, payload)
    return create_success_response(data=data)


@router.post(
    "/import-excel",
    response_model=StandardResponse[SaleImportExcelResponse],
    status_code=status.HTTP_200_OK,
    summary="Impor riwayat penjualan dari berkas Excel (.xlsx) in-memory",
)
async def import_sales_excel(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SaleImportExcelResponse]:
    file_bytes = await file.read()
    use_cases = SaleUseCases(db)
    data = await use_cases.import_sales_excel(current_user, file_bytes)
    return create_success_response(data=data)


@router.post(
    "/import",
    response_model=StandardResponse[SaleImportExcelResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Impor riwayat penjualan dari baris JSON hasil parser browser",
)
async def import_sales_json(
    payload: SaleImportJsonRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SaleImportExcelResponse]:
    use_cases = SaleUseCases(db)
    data = await use_cases.import_sales_json(current_user, payload)
    return create_success_response(data=data)


@router.delete(
    "/{sale_id}",
    response_model=StandardResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Hapus catatan penjualan",
)
async def delete_sale(
    sale_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[None]:
    use_cases = SaleUseCases(db)
    await use_cases.delete_sale(current_user.id, sale_id)
    return create_success_response(data=None)
