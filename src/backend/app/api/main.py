from __future__ import annotations

from fastapi import APIRouter

from app.api.auth.views import router as auth_router
from app.api.batch.views import router as batch_router
from app.api.event.views import router as event_router
from app.api.health.views import router as health_router
from app.api.ingredient.views import router as ingredient_router
from app.api.product.views import router as product_router
from app.api.sale.views import router as sale_router
from app.api.user.views import router as user_router
from app.api.waste_log.views import router as waste_log_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/health")
api_router.include_router(auth_router, prefix="/auth")
api_router.include_router(user_router, prefix="/users")
api_router.include_router(ingredient_router, prefix="/ingredients", tags=["Ingredients"])
api_router.include_router(product_router, prefix="/products", tags=["Products"])
api_router.include_router(batch_router, prefix="/batches", tags=["Batches"])
api_router.include_router(waste_log_router, prefix="/waste-logs", tags=["Waste Logs"])
api_router.include_router(event_router, prefix="/events", tags=["Events"])
api_router.include_router(sale_router, prefix="/sales", tags=["Sales"])
