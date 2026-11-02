"""Skrip Seeding Data Awal Realistis untuk StockWise (Fase 10 / T-10.3).

Menyediakan data demo UMKM Katering (demo@stockwise.id) berbasis SQLAlchemy async session:
- Akun demo dengan kata sandi ter-hash (Demo1234!)
- Master data bahan baku (Daging Ayam, Beras, Minyak Goreng, Bawang Merah, Cabai Merah)
- Menu produk & komposisi resep (Nasi Ayam Bakar, Nasi Goreng Spesial)
- Batch stok masuk aktif dan batch mendekati tanggal kedaluwarsa
- Riwayat transaksi penjualan 90 hari terakhir berpola realistis (DOW & event)
- Event hari khusus ("Tanggal Gajian", "Libur Nasional")
- Pelatihan awal model time-series evaluasi

Skrip ini bersifat IDEMPOTEN: dapat dijalankan berulang kali secara aman tanpa
pelanggaran integrity constraint atau duplikasi data.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
import logging
import random
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.api.evaluation.use_cases import EvaluationUseCase
from app.connections.postgres import AsyncSessionLocal
from app.lib.jwt_utils import hash_password
from app.models.batch_model import Batch
from app.models.event_model import Event
from app.models.ingredient_model import Ingredient
from app.models.product_model import Product
from app.models.recipe_model import Recipe
from app.models.sale_model import Sale
from app.models.user_model import User
from app.models.waste_log_model import WasteLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

WIB = ZoneInfo("Asia/Jakarta")
DEMO_EMAIL = "demo@stockwise.id"
DEMO_PASSWORD_PLAIN = "Demo1234!"
RNG_SEED = 42


async def seed_data(session=None) -> User:
    """Menyuntikkan data awal realistis untuk akun demo secara idempoten."""
    own_session = False
    if session is None:
        session = AsyncSessionLocal()
        own_session = True

    try:
        today = datetime.now(WIB).date()
        history_start = today - timedelta(days=90)
        rng = random.Random(RNG_SEED)

        logger.info(f"Memulai seeding data demo untuk tanggal acuan {today}...")

        # 1. Idempotensi: Jika akun demo sudah ada, bersihkan data lamanya terlebih dahulu
        res = await session.execute(select(User).where(User.email == DEMO_EMAIL))
        existing_user = res.scalars().first()
        if existing_user is not None:
            logger.info(f"Akun demo {DEMO_EMAIL} sudah ada. Menghapus data lama untuk reset idempoten...")
            await session.delete(existing_user)
            await session.commit()

        # 2. Buat akun demo UMKM Katering
        demo_user = User(
            name="Sari Wulandari",
            email=DEMO_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD_PLAIN),
            role="freemium",
            business_name="Dapur Katering Berkah",
            business_type="katering",
            city="Bandung",
            phone="081234567890",
        )
        session.add(demo_user)
        await session.flush()
        user_id = demo_user.id
        logger.info(f"Akun demo dibuat: ID={user_id}, Email={demo_user.email}")

        # 3. Master Data Bahan Baku
        # Daging Ayam, Beras, Minyak Goreng, Bawang Merah, Cabai Merah
        ing_ayam = Ingredient(
            user_id=user_id,
            name="Daging Ayam",
            unit="kg",
            category="segar",
            shelf_life_days=3,
            min_stock=5.0,
            price=38000.0,
        )
        ing_beras = Ingredient(
            user_id=user_id,
            name="Beras",
            unit="kg",
            category="tahan_lama",
            shelf_life_days=180,
            min_stock=20.0,
            price=14000.0,
        )
        ing_minyak = Ingredient(
            user_id=user_id,
            name="Minyak Goreng",
            unit="liter",
            category="tahan_lama",
            shelf_life_days=180,
            min_stock=5.0,
            price=18000.0,
        )
        ing_bawang = Ingredient(
            user_id=user_id,
            name="Bawang Merah",
            unit="kg",
            category="segar",
            shelf_life_days=14,
            min_stock=2.0,
            price=35000.0,
        )
        ing_cabai = Ingredient(
            user_id=user_id,
            name="Cabai Merah",
            unit="kg",
            category="segar",
            shelf_life_days=7,
            min_stock=2.0,
            price=40000.0,
        )
        session.add_all([ing_ayam, ing_beras, ing_minyak, ing_bawang, ing_cabai])
        await session.flush()
        logger.info("Master data 5 bahan baku berhasil disimpan.")

        # 4. Master Data Produk Menu & Komposisi Resep
        # Nasi Ayam Bakar & Nasi Goreng Spesial
        prod_ayam = Product(
            user_id=user_id,
            name="Nasi Ayam Bakar",
            price=25000.0,
            active=True,
        )
        prod_nasgor = Product(
            user_id=user_id,
            name="Nasi Goreng Spesial",
            price=20000.0,
            active=True,
        )
        session.add_all([prod_ayam, prod_nasgor])
        await session.flush()

        recipes = [
            # Nasi Ayam Bakar (per porsi)
            Recipe(product_id=prod_ayam.id, ingredient_id=ing_ayam.id, qty=0.2),       # 200 g ayam
            Recipe(product_id=prod_ayam.id, ingredient_id=ing_beras.id, qty=0.12),     # 120 g beras
            Recipe(product_id=prod_ayam.id, ingredient_id=ing_minyak.id, qty=0.02),    # 20 ml minyak
            Recipe(product_id=prod_ayam.id, ingredient_id=ing_bawang.id, qty=0.015),   # 15 g bawang
            Recipe(product_id=prod_ayam.id, ingredient_id=ing_cabai.id, qty=0.01),     # 10 g cabai
            # Nasi Goreng Spesial (per porsi)
            Recipe(product_id=prod_nasgor.id, ingredient_id=ing_ayam.id, qty=0.05),     # 50 g ayam
            Recipe(product_id=prod_nasgor.id, ingredient_id=ing_beras.id, qty=0.15),    # 150 g beras
            Recipe(product_id=prod_nasgor.id, ingredient_id=ing_minyak.id, qty=0.03),   # 30 ml minyak
            Recipe(product_id=prod_nasgor.id, ingredient_id=ing_bawang.id, qty=0.02),   # 20 g bawang
            Recipe(product_id=prod_nasgor.id, ingredient_id=ing_cabai.id, qty=0.015),  # 15 g cabai
        ]
        session.add_all(recipes)
        await session.flush()
        logger.info("2 produk menu dan 10 item resep berhasil disimpan.")

        # 5. Event Hari Khusus ("Tanggal Gajian", "Libur Nasional")
        # Dibuat untuk kurun waktu -120 hari s/d +60 hari
        event_objects = []
        event_impact_map = {}

        # Tanggal Gajian tiap tanggal 25 & 26
        check_date = today - timedelta(days=120)
        end_event_date = today + timedelta(days=60)
        while check_date <= end_event_date:
            if check_date.day in (25, 26):
                ev = Event(
                    user_id=user_id,
                    name="Tanggal Gajian",
                    date=check_date,
                    impact=1.20,
                    category="gajian",
                )
                event_objects.append(ev)
                event_impact_map[check_date] = max(event_impact_map.get(check_date, 1.0), 1.20)
            check_date += timedelta(days=1)

        # Hari Libur Nasional tetap & bergerak dalam jendela
        # 17 Agustus, Tahun Baru, dll.
        for year in {history_start.year, today.year, (today + timedelta(days=60)).year}:
            for m, d, name in [(1, 1, "Tahun Baru"), (8, 17, "Hari Kemerdekaan"), (12, 25, "Libur Nasional")]:
                try:
                    hol_d = date(year, m, d)
                    if history_start - timedelta(days=30) <= hol_d <= end_event_date:
                        ev = Event(
                            user_id=user_id,
                            name=name,
                            date=hol_d,
                            impact=1.30,
                            category="nasional",
                        )
                        event_objects.append(ev)
                        event_impact_map[hol_d] = max(event_impact_map.get(hol_d, 1.0), 1.30)
                except ValueError:
                    pass

        session.add_all(event_objects)
        await session.flush()
        logger.info(f"{len(event_objects)} event hari khusus berhasil didaftarkan.")

        # 6. Riwayat Transaksi Penjualan 90 Hari Terakhir (T-90 s/d T)
        # Pola hari dalam seminggu (Senin-Minggu) + Event multiplier + Deterministic noise
        # Senin=0, Selasa=1, Rabu=2, Kamis=3, Jumat=4, Sabtu=5, Minggu=6
        dow_mult = [1.0, 0.95, 0.95, 1.0, 1.15, 1.25, 1.2]

        total_ayam_needed = 0.0
        total_beras_needed = 0.0
        total_minyak_needed = 0.0
        total_bawang_needed = 0.0
        total_cabai_needed = 0.0

        today_ayam_consumed = 0.0
        today_beras_consumed = 0.0
        today_minyak_consumed = 0.0
        today_bawang_consumed = 0.0
        today_cabai_consumed = 0.0

        sales_records = []
        for offset in range(90, -1, -1):
            sale_date = today - timedelta(days=offset)
            w = sale_date.weekday()
            ev_mult = event_impact_map.get(sale_date, 1.0)
            noise_ayam = rng.uniform(-2.0, 2.0)
            noise_nasgor = rng.uniform(-2.0, 2.0)

            # Volume penjualan ayam bakar (~82 porsi base) & nasi goreng (~62 porsi base)
            q_ayam = max(10, int(round(82.0 * dow_mult[w] * ev_mult + noise_ayam)))
            q_nasgor = max(10, int(round(62.0 * dow_mult[w] * ev_mult + noise_nasgor)))

            # Sumber: 60 hari pertama 'excel', 30 hari terakhir 'manual'
            src = "excel" if offset > 30 else "manual"
            sales_records.append(
                Sale(user_id=user_id, product_id=prod_ayam.id, qty=q_ayam, date=sale_date, source=src)
            )
            sales_records.append(
                Sale(user_id=user_id, product_id=prod_nasgor.id, qty=q_nasgor, date=sale_date, source=src)
            )

            c_ayam = q_ayam * 0.2 + q_nasgor * 0.05
            c_beras = q_ayam * 0.12 + q_nasgor * 0.15
            c_minyak = q_ayam * 0.02 + q_nasgor * 0.03
            c_bawang = q_ayam * 0.015 + q_nasgor * 0.02
            c_cabai = q_ayam * 0.01 + q_nasgor * 0.015

            total_ayam_needed += c_ayam
            total_beras_needed += c_beras
            total_minyak_needed += c_minyak
            total_bawang_needed += c_bawang
            total_cabai_needed += c_cabai

            if sale_date == today:
                today_ayam_consumed = c_ayam
                today_beras_consumed = c_beras
                today_minyak_consumed = c_minyak
                today_bawang_consumed = c_bawang
                today_cabai_consumed = c_cabai

        session.add_all(sales_records)
        await session.flush()
        logger.info(f"{len(sales_records)} catatan transaksi penjualan (91 hari) berhasil disimpan.")

        # 7. Batch Stok Masuk (Historis, Aktif, & Mendekati Kedaluwarsa)
        batches = []

        # (a) Batch historis yang habis terpakai di masa lampau
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_ayam.id,
            qty=round(total_ayam_needed - today_ayam_consumed, 4),
            unit_price=38000.0,
            received_date=history_start,
            expiry_date=today - timedelta(days=1),
            source="pembelian",
        ))
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_beras.id,
            qty=round(total_beras_needed - today_beras_consumed, 4),
            unit_price=14000.0,
            received_date=history_start,
            expiry_date=today - timedelta(days=1),
            source="pembelian",
        ))
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_minyak.id,
            qty=round(total_minyak_needed - today_minyak_consumed, 4),
            unit_price=18000.0,
            received_date=history_start,
            expiry_date=today - timedelta(days=1),
            source="pembelian",
        ))
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_bawang.id,
            qty=round(total_bawang_needed - today_bawang_consumed, 4),
            unit_price=35000.0,
            received_date=history_start,
            expiry_date=today - timedelta(days=1),
            source="pembelian",
        ))
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_cabai.id,
            qty=round(total_cabai_needed - today_cabai_consumed, 4),
            unit_price=40000.0,
            received_date=history_start,
            expiry_date=today - timedelta(days=1),
            source="pembelian",
        ))

        # (b) Batch aktif hari ini (T) yang layak pakai untuk besok (T+1):
        # 1. Daging Ayam: pemakaian hari ini + persis 5.0 kg sisa layak pakai besok, kedaluwarsa T+2
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_ayam.id,
            qty=round(today_ayam_consumed + 5.0, 4),
            unit_price=38000.0,
            received_date=today,
            expiry_date=today + timedelta(days=2),
            source="pembelian",
        ))

        # 2. Beras: pemakaian hari ini + 350 kg sisa, kedaluwarsa T+150
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_beras.id,
            qty=round(today_beras_consumed + 350.0, 4),
            unit_price=14000.0,
            received_date=today - timedelta(days=10),
            expiry_date=today + timedelta(days=150),
            source="pembelian",
        ))

        # 3. Minyak Goreng: pemakaian hari ini + 60 liter sisa, kedaluwarsa T+150
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_minyak.id,
            qty=round(today_minyak_consumed + 60.0, 4),
            unit_price=18000.0,
            received_date=today - timedelta(days=5),
            expiry_date=today + timedelta(days=150),
            source="pembelian",
        ))

        # 4. Bawang Merah: pemakaian hari ini + 6 kg sisa, kedaluwarsa T+8
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_bawang.id,
            qty=round(today_bawang_consumed + 6.0, 4),
            unit_price=35000.0,
            received_date=today - timedelta(days=2),
            expiry_date=today + timedelta(days=8),
            source="pembelian",
        ))

        # 5. Cabai Merah:
        # Batch 1 (mendekati kedaluwarsa): pemakaian hari ini + 2.0 kg, kedaluwarsa T+1
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_cabai.id,
            qty=round(today_cabai_consumed + 2.0, 4),
            unit_price=40000.0,
            received_date=today - timedelta(days=6),
            expiry_date=today + timedelta(days=1),
            source="pembelian",
        ))
        # Batch 2: 4.5 kg, kedaluwarsa T+3 (menghasilkan Waste Risk Score sedang untuk demo UC-07)
        batches.append(Batch(
            user_id=user_id,
            ingredient_id=ing_cabai.id,
            qty=4.5,
            unit_price=40000.0,
            received_date=today - timedelta(days=2),
            expiry_date=today + timedelta(days=3),
            source="pembelian",
        ))

        session.add_all(batches)
        await session.flush()
        logger.info(f"{len(batches)} batch stok (historis & aktif) berhasil disimpan.")

        # 8. Catatan Limbah Masa Lalu (Historis)
        waste_logs = [
            WasteLog(user_id=user_id, ingredient_id=ing_cabai.id, qty=0.5, date=today - timedelta(days=10), reason="busuk"),
            WasteLog(user_id=user_id, ingredient_id=ing_ayam.id, qty=0.5, date=today - timedelta(days=25), reason="rusak"),
        ]
        session.add_all(waste_logs)
        await session.flush()

        await session.commit()
        logger.info("Seluruh transaksi basis data berhasil di-commit.")

        # 9. Inisialisasi Model Training
        logger.info("Menjalankan pelatihan awal model time-series evaluasi...")
        eval_result = await EvaluationUseCase(session).train(user_id)
        logger.info(f"Model berhasil dilatih: alpha={eval_result['optimal_alpha']}, wape={eval_result['wape']}")

        logger.info("=== SEEDING SELESAI DENGAN SUKSES ===")
        return demo_user

    except Exception as exc:
        await session.rollback()
        logger.error(f"Seeding gagal: {exc}", exc_info=True)
        raise
    finally:
        if own_session:
            await session.close()


def main():
    """Fungsi utama saat dijalankan lewat perintah CLI: python -m app.seed"""
    asyncio.run(seed_data())


if __name__ == "__main__":
    main()
