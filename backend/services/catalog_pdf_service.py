"""
OMNICAT ENTERPRISE - PROFESSIONAL MULTI-BRAND DIGITAL CATALOG PDF GENERATOR
Generates 2 distinct official catalog document formats:
1. DISPLAY_LANDSCAPE (A4 Landscape): Public showcase for pet clinics & shops with ZERO pricing.
2. B2B_PRICE_SHEET (A4 Portrait): Official wholesale price sheet with tiered pricing, MOQs, & bank accounts.
"""

import os
import io
import uuid
import qrcode
from datetime import datetime, date
from typing import Optional, Dict, Any, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT, TA_JUSTIFY

from backend.database import db
from backend.models import CatalogPdfInput, CatalogPdfResult

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CATALOG_OUTPUT_DIR = os.path.join(WORKSPACE_ROOT, "data", "generated_catalogs")
os.makedirs(CATALOG_OUTPUT_DIR, exist_ok=True)


class NumberedCanvas:
    """Canvas helper for adding page numbers and subtle footer metadata."""
    pass


class CatalogPdfService:
    def __init__(self, database=None):
        self.db = database or db

    def generate_catalog_pdf(
        self,
        catalog_input: CatalogPdfInput,
        output_path: Optional[str] = None
    ) -> CatalogPdfResult:
        """
        Generates either an A4 Landscape Public Display Catalog (Zero-Pricing)
        or an A4 Portrait Official B2B Price Sheet for the specified brand.
        """
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 1. Fetch Brand Profile & Bank Accounts
            cur.execute("""
                SELECT id, code, name, legal_entity_name, address, phone, email, website
                FROM brands
                WHERE id = ? OR code = ?
            """, (catalog_input.brand_id, catalog_input.brand_id))
            brand = cur.fetchone()
            if not brand:
                raise ValueError(f"Brand dengan ID/Code '{catalog_input.brand_id}' tidak ditemukan.")

            cur.execute("""
                SELECT bank_name, account_number, account_holder_name, is_primary
                FROM brand_bank_accounts
                WHERE brand_id = ? AND (timelock_until IS NULL OR timelock_until <= CURRENT_TIMESTAMP)
                ORDER BY is_primary DESC, created_at ASC
            """, (brand["id"],))
            bank_accounts = cur.fetchall()

            # 2. Fetch Products and Product Variants for this Brand
            cur.execute("""
                SELECT 
                    p.id as product_id, p.name as product_name, p.category, p.sku_prefix,
                    pv.id as variant_id, pv.sku as variant_sku, pv.name as variant_name,
                    pv.packaging_unit, pv.unit_multiplier, pv.weight_kg
                FROM products p
                JOIN product_variants pv ON p.id = pv.product_id
                WHERE p.brand_id = ? AND pv.is_active = 1
                ORDER BY pv.unit_multiplier DESC
            """, (brand["id"],))
            variants = cur.fetchall()

            # Fallback if no variants found for custom brand
            if not variants:
                cur.execute("""
                    SELECT 
                        p.id as product_id, p.name as product_name, p.category, p.sku_prefix,
                        pv.id as variant_id, pv.sku as variant_sku, pv.name as variant_name,
                        pv.packaging_unit, pv.unit_multiplier, pv.weight_kg
                    FROM products p
                    JOIN product_variants pv ON p.id = pv.product_id
                    WHERE pv.is_active = 1
                    ORDER BY pv.unit_multiplier DESC
                """)
                variants = cur.fetchall()

            # 3. Determine Format Type and Delegate Generation
            fmt = catalog_input.format_type.upper()
            if fmt in ("DISPLAY_LANDSCAPE", "LANDSCAPE", "PUBLIC"):
                return self._generate_landscape_display(
                    brand=brand,
                    variants=variants,
                    catalog_input=catalog_input,
                    output_path=output_path
                )
            elif fmt in ("B2B_PRICE_SHEET", "PORTRAIT", "PRICE_SHEET"):
                return self._generate_portrait_price_sheet(
                    brand=brand,
                    variants=variants,
                    bank_accounts=bank_accounts,
                    catalog_input=catalog_input,
                    output_path=output_path
                )
            else:
                raise ValueError(f"Format katalog '{catalog_input.format_type}' tidak valid. Gunakan 'DISPLAY_LANDSCAPE' atau 'B2B_PRICE_SHEET'.")

        finally:
            conn.close()

    def _generate_landscape_display(
        self,
        brand: Dict[str, Any],
        variants: List[Dict[str, Any]],
        catalog_input: CatalogPdfInput,
        output_path: Optional[str] = None
    ) -> CatalogPdfResult:
        """
        Generates A4 Landscape Public Showcase Catalog.
        ENFORCES STRICT ZERO-PRICING PRIVACY INVARIANT:
        Contains NO Rp, NO currency amounts, NO wholesale numbers, NO COGS.
        Safe for public hanging / display in clinics and pet shops.
        """
        brand_code = brand["code"]
        brand_name = brand["name"]
        filename = f"CATALOG_DISPLAY_{brand_code}_{date.today().strftime('%Y%m%d')}.pdf"
        target_path = output_path or os.path.join(CATALOG_OUTPUT_DIR, filename)

        # Page Dimensions: A4 Landscape (297 mm x 210 mm)
        doc = SimpleDocTemplate(
            target_path,
            pagesize=landscape(A4),
            leftMargin=10 * mm,
            rightMargin=10 * mm,
            topMargin=10 * mm,
            bottomMargin=10 * mm
        )

        styles = getSampleStyleSheet()

        # Brand Color Schemes
        if "ZEOLITE" in brand_code.upper():
            c_primary = colors.HexColor("#065F46")      # Deep Emerald
            c_secondary = colors.HexColor("#047857")    # Forest Green
            c_accent = colors.HexColor("#D97706")       # Amber
            c_bg_light = colors.HexColor("#ECFDF5")     # Mint light tint
            c_card_bg = colors.HexColor("#F0FDF4")
            slogan = "Pasir Zeolit Alam Murni Berpori Tinggi • Solusi Higienis & Alami Pilihan Dokter Hewan"
        else:
            c_primary = colors.HexColor("#1E3A8A")      # Navy Blue
            c_secondary = colors.HexColor("#2563EB")    # Royal Blue
            c_accent = colors.HexColor("#D97706")       # Amber Gold
            c_bg_light = colors.HexColor("#EFF6FF")     # Soft blue tint
            c_card_bg = colors.HexColor("#F8FAFC")      # Slate 50
            slogan = "Formula Cepat Gumpal • Bebas Debu • Aroma Segar Alami • Pilihan Utama Dokter Hewan & Cattery"

        c_text_dark = colors.HexColor("#0F172A")
        c_text_muted = colors.HexColor("#475569")
        c_border = colors.HexColor("#CBD5E1")

        # Custom Typographic Styles
        style_brand_title = ParagraphStyle(
            'LandscapeBrandTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=22,
            leading=26,
            textColor=c_primary
        )

        style_slogan = ParagraphStyle(
            'LandscapeSlogan',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=10,
            leading=13,
            textColor=c_text_muted
        )

        style_badge_text = ParagraphStyle(
            'LandscapeBadgeText',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=12,
            textColor=colors.white,
            alignment=TA_CENTER
        )

        style_sec_title = ParagraphStyle(
            'LandscapeSecTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=15,
            textColor=c_primary
        )

        style_card_title = ParagraphStyle(
            'LandscapeCardTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=13,
            textColor=c_secondary
        )

        style_card_body = ParagraphStyle(
            'LandscapeCardBody',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=11,
            textColor=c_text_dark
        )

        style_footer = ParagraphStyle(
            'LandscapeFooter',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=11,
            textColor=c_text_muted,
            alignment=TA_CENTER
        )

        story = []

        # -------------------------------------------------------------
        # 1. HERO HEADER BANNER
        # -------------------------------------------------------------
        badge_p = Paragraph(
            "<b>✨ JAMINAN MUTU KLINIK</b><br/><font size='7.5'>100% Bento-Clay Alami Pilihan Dokter Hewan</font>",
            style_badge_text
        )
        badge_table = Table([[badge_p]], colWidths=[65 * mm], rowHeights=[14 * mm])
        badge_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), c_accent),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
        ]))

        header_left = [
            Paragraph(f"<b>{brand_name.upper()}</b>", style_brand_title),
            Spacer(1, 1 * mm),
            Paragraph(slogan, style_slogan)
        ]

        header_table = Table(
            [[header_left, badge_table]],
            colWidths=[210 * mm, 67 * mm]
        )
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 2 * mm))
        story.append(HRFlowable(width="100%", thickness=2, color=c_primary, spaceBefore=0, spaceAfter=4))

        # -------------------------------------------------------------
        # 2. 4 CORE PRODUCT EXCELLENCE PILLARS (KEUNGGULAN UTAMA)
        # -------------------------------------------------------------
        story.append(Paragraph("<b>4 KEUNGGULAN FORMULA PREMIUM</b>", style_sec_title))
        story.append(Spacer(1, 1.5 * mm))

        pillars_data = [
            [
                Paragraph("<b>⚡ GUMPAL INSTAN (3 DETIK)</b>", style_card_title),
                Paragraph("<b>🌿 99.5% BEBAS DEBU</b>", style_card_title),
                Paragraph("<b>🌸 ODOUR LOCK FORMULA</b>", style_card_title),
                Paragraph("<b>💧 DAYA SERAP EKSTRA 350%</b>", style_card_title),
            ],
            [
                Paragraph("Mengunci cairan urine seketika menjadi bulatan padat kokoh. Mudah diserok tanpa retak atau hancur.", style_card_body),
                Paragraph("Proses multi-dedusting higienis. Menjaga kesehatan paru-paru kucing dan aman bagi cat lover alergi.", style_card_body),
                Paragraph("Partikel pengikat amonia aktif menetralkan bau tak sedap secara tuntas hingga 14 hari penuh.", style_card_body),
                Paragraph("Formula bentonit alam berpori mikro menyerap 3.5x bobot kering. Sangat irit dan efisien.", style_card_body),
            ]
        ]
        pillars_table = Table(pillars_data, colWidths=[68 * mm, 68 * mm, 68 * mm, 68 * mm])
        pillars_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), c_bg_light),
            ('BOX', (0, 0), (-1, -1), 1, c_secondary),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(pillars_table)
        story.append(Spacer(1, 3.5 * mm))

        # -------------------------------------------------------------
        # 3. MIDDLE SECTION: SCENTS & PACKAGING SHOWCASE (2 COLUMNS)
        # -------------------------------------------------------------
        # Left Column: Natural Fragrance Showcase
        left_sec = [
            Paragraph("<b>PILIHAN AROMA ALAMI EKSKLUSIF</b>", style_sec_title),
            Spacer(1, 1.5 * mm),
            Table([
                [
                    Paragraph("<b>🪻 Lavender Blossom</b>", style_card_title),
                    Paragraph("Aroma floral herbal menenangkan yang meredakan stres kucing di litter box.", style_card_body)
                ],
                [
                    Paragraph("<b>🍋 Fresh Lemon</b>", style_card_title),
                    Paragraph("Kesegaran citrus alami aktif yang mengusir aroma amonia membandel seketika.", style_card_body)
                ],
                [
                    Paragraph("<b>🍏 Crisp Green Apple</b>", style_card_title),
                    Paragraph("Wangi apel segar lembut yang disukai anak kucing dan kucing berhidung sensitif.", style_card_body)
                ],
                [
                    Paragraph("<b>☕ Roasted Coffee Bean</b>", style_card_title),
                    Paragraph("Ekstrak biji kopi sangrai dengan daya serap bau paling kuat untuk ruangan indoor tertutup.", style_card_body)
                ],
            ], colWidths=[40 * mm, 95 * mm],
            style=[
                ('BACKGROUND', (0, 0), (-1, -1), c_card_bg),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
                ('BOX', (0, 0), (-1, -1), 1, c_border),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ])
        ]

        # Right Column: Practical Packaging Sizes & Specifications
        packaging_rows = []
        for v in variants[:4]:
            sku = v["variant_sku"]
            vname = v["variant_name"]
            vol = v["unit_multiplier"]
            punit = v["packaging_unit"]
            if "25" in sku or vol >= 20:
                spec_desc = f"<b>{vname} ({vol:g} Liter)</b><br/><font size='7.5' color='#475569'>Ukuran Jumbo Sak Ekonomis. Pilihan utama untuk Cattery, Shelter, Pet Clinic & Multi-Cat Family.</font>"
            elif "10" in sku or vol >= 10:
                spec_desc = f"<b>{vname} ({vol:g} Liter)</b><br/><font size='7.5' color='#475569'>Ukuran Terlaris Rumah Tangga. Dilengkapi pegangan kokoh, pas untuk penggunaan rutin 2-3 kucing.</font>"
            else:
                spec_desc = f"<b>{vname} ({vol:g} Liter)</b><br/><font size='7.5' color='#475569'>Kemasan Ringkas & Fleksibel. Sangat praktis dibawa, pas untuk single cat dan pemula.</font>"
            packaging_rows.append([Paragraph(spec_desc, style_card_body)])

        if not packaging_rows:
            packaging_rows.append([Paragraph("Tersedia dalam berbagai pilihan kemasan sak dan bag higienis.", style_card_body)])

        right_sec = [
            Paragraph("<b>PILIHAN KEMASAN HIGIENIS</b>", style_sec_title),
            Spacer(1, 1.5 * mm),
            Table(
                packaging_rows,
                colWidths=[132 * mm],
                style=[
                    ('BACKGROUND', (0, 0), (-1, -1), c_card_bg),
                    ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
                    ('BOX', (0, 0), (-1, -1), 1, c_border),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ]
            )
        ]

        mid_table = Table([[left_sec, right_sec]], colWidths=[138 * mm, 137 * mm])
        mid_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(mid_table)
        story.append(Spacer(1, 3 * mm))

        # -------------------------------------------------------------
        # 4. BOTTOM BAR: USAGE GUIDE (3 EASY STEPS) + FOOTER CONTACT
        # -------------------------------------------------------------
        guide_cells = [
            Paragraph("<b>LANGKAH 1</b><br/>Tuang pasir setinggi 5-7 cm ke dalam litter box bersih.", style_card_body),
            Paragraph("<b>LANGKAH 2</b><br/>Angkat gumpalan urine dan kotoran setiap hari dengan serokan.", style_card_body),
            Paragraph("<b>LANGKAH 3</b><br/>Tambahkan pasir secukupnya agar ketinggian tetap stabil.", style_card_body),
            Paragraph(
                f"<b>LAYANAN KONSUMEN & INFORMASI RESMI</b><br/>"
                f"Hotline: {brand['phone'] or '0812-3456-7890'} | Email: {brand['email'] or 'info@omnicat.id'}<br/>"
                f"<font size='7' color='#64748B'>Didistribusikan secara resmi oleh {brand['legal_entity_name'] or brand_name}</font>",
                style_card_body
            )
        ]
        guide_table = Table([guide_cells], colWidths=[55 * mm, 55 * mm, 55 * mm, 110 * mm])
        guide_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (2, -1), c_bg_light),
            ('BACKGROUND', (3, 0), (3, -1), colors.HexColor("#F1F5F9")),
            ('BOX', (0, 0), (-1, -1), 1, c_secondary),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(guide_table)

        # Build document
        doc.build(story)

        file_size = os.path.getsize(target_path)
        return CatalogPdfResult(
            brand_id=brand["id"],
            brand_code=brand_code,
            brand_name=brand_name,
            format_type="DISPLAY_LANDSCAPE",
            orientation="LANDSCAPE",
            file_path=target_path,
            page_count=1,
            file_size_bytes=file_size,
            has_pricing=False,
            generated_at=datetime.now().isoformat()
        )

    def _generate_portrait_price_sheet(
        self,
        brand: Dict[str, Any],
        variants: List[Dict[str, Any]],
        bank_accounts: List[Dict[str, Any]],
        catalog_input: CatalogPdfInput,
        output_path: Optional[str] = None
    ) -> CatalogPdfResult:
        """
        Generates A4 Portrait Official B2B Wholesale Price Sheet.
        Contains tiered pricing (HET / Toko / Distributor FTL), MOQs,
        Estafet shared freight terms, and official company bank accounts.
        """
        brand_code = brand["code"]
        brand_name = brand["name"]
        filename = f"PRICE_SHEET_B2B_{brand_code}_{date.today().strftime('%Y%m%d')}.pdf"
        target_path = output_path or os.path.join(CATALOG_OUTPUT_DIR, filename)

        # Page Dimensions: A4 Portrait (210 mm x 297 mm)
        doc = SimpleDocTemplate(
            target_path,
            pagesize=A4,
            leftMargin=12 * mm,
            rightMargin=12 * mm,
            topMargin=12 * mm,
            bottomMargin=12 * mm
        )

        styles = getSampleStyleSheet()

        if "ZEOLITE" in brand_code.upper():
            c_primary = colors.HexColor("#065F46")      # Deep Emerald
            c_secondary = colors.HexColor("#047857")    # Forest Green
            c_accent = colors.HexColor("#D97706")       # Amber Gold
            c_bg_light = colors.HexColor("#ECFDF5")
        else:
            c_primary = colors.HexColor("#1E3A8A")      # Navy Blue
            c_secondary = colors.HexColor("#1D4ED8")    # Royal Blue
            c_accent = colors.HexColor("#D97706")       # Amber Gold
            c_bg_light = colors.HexColor("#EFF6FF")

        c_text_dark = colors.HexColor("#0F172A")
        c_text_muted = colors.HexColor("#475569")
        c_border = colors.HexColor("#CBD5E1")
        c_row_alt = colors.HexColor("#F8FAFC")

        style_title = ParagraphStyle(
            'B2BTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=15,
            leading=18,
            textColor=c_primary,
            alignment=TA_LEFT
        )

        style_subtitle = ParagraphStyle(
            'B2BSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=12,
            textColor=c_accent,
            alignment=TA_LEFT
        )

        style_meta = ParagraphStyle(
            'B2BMeta',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=11,
            textColor=c_text_muted,
            alignment=TA_RIGHT
        )

        style_sec_title = ParagraphStyle(
            'B2BSecTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=13,
            textColor=c_primary
        )

        style_tbl_header = ParagraphStyle(
            'B2BTblHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=7.5,
            leading=10,
            textColor=colors.white,
            alignment=TA_CENTER
        )

        style_tbl_cell = ParagraphStyle(
            'B2BTblCell',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=7.5,
            leading=10,
            textColor=c_text_dark
        )

        style_tbl_cell_bold = ParagraphStyle(
            'B2BTblCellBold',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=7.5,
            leading=10,
            textColor=c_primary
        )

        style_tbl_cell_right = ParagraphStyle(
            'B2BTblCellRight',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=7.5,
            leading=10,
            textColor=c_text_dark,
            alignment=TA_RIGHT
        )

        style_body = ParagraphStyle(
            'B2BBody',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=7.5,
            leading=10.5,
            textColor=c_text_dark
        )

        story = []

        # -------------------------------------------------------------
        # 1. OFFICIAL LETTERHEAD & DOCUMENT HEADER
        # -------------------------------------------------------------
        curr_year = date.today().year
        doc_ref = f"PL/{brand_code}/{curr_year}/01"
        effective_str = catalog_input.effective_date or date.today().strftime("%d %B %Y")

        left_header = [
            Paragraph(f"<b>{brand['legal_entity_name'] or brand_name}</b>", style_title),
            Paragraph(f"DIVISI DISTRIBUSI & LOGISTIK REGIONAL • {brand_name.upper()}", style_subtitle),
            Paragraph(f"{brand['address'] or 'Jawa Timur, Indonesia'} • Telp: {brand['phone'] or '0812-3456-7890'}", style_body),
        ]

        right_header = [
            Paragraph(f"<b>LEMBAR HARGA RESMI B2B</b>", ParagraphStyle('H1', parent=style_title, fontSize=11, leading=13, alignment=TA_RIGHT)),
            Paragraph(f"No. Dokumen: <b>{doc_ref}</b>", style_meta),
            Paragraph(f"Tanggal Berlaku: <b>{effective_str}</b>", style_meta),
            Paragraph(f"Status: <font color='#059669'><b>OFFICIAL DISTRIBUTOR RATE</b></font>", style_meta),
        ]

        header_table = Table([[left_header, right_header]], colWidths=[110 * mm, 76 * mm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 1 * mm))
        story.append(HRFlowable(width="100%", thickness=1.5, color=c_primary, spaceBefore=0, spaceAfter=4))

        # -------------------------------------------------------------
        # 2. MASTER PRICE TABLE (TIERED B2B PRICING)
        # -------------------------------------------------------------
        story.append(Paragraph("<b>1. TABEL HARGA DISTRIBUSI & GROSIR TOKO RESMI</b>", style_sec_title))
        story.append(Spacer(1, 1 * mm))

        price_table_headers = [
            Paragraph("<b>No</b>", style_tbl_header),
            Paragraph("<b>Kode SKU</b>", style_tbl_header),
            Paragraph("<b>Nama Produk & Varian</b>", style_tbl_header),
            Paragraph("<b>Isi / Kemasan</b>", style_tbl_header),
            Paragraph("<b>HET / Retail</b>", style_tbl_header),
            Paragraph("<b>Grosir Toko<br/>(Tier 1)</b>", style_tbl_header),
            Paragraph("<b>Distributor<br/>(Tier 2 - FTL)</b>", style_tbl_header),
            Paragraph("<b>MOQ (Sak/Bag)</b>", style_tbl_header),
        ]

        price_rows = [price_table_headers]

        # Tiered pricing reference mapping
        # Derived from historical database figures
        tier_ref = {
            "BC-PRM-25L": {"het": 95000, "toko": 71500, "ftl": 66500, "moq": "50 Sak"},
            "BC-PRM-10L": {"het": 48000, "toko": 36000, "ftl": 33500, "moq": "100 Bag"},
            "BC-PRM-5.5L": {"het": 28000, "toko": 20500, "ftl": 18500, "moq": "150 Bag"},
            "ZEO-LITTER": {"het": 25000, "toko": 12500, "ftl": 11000, "moq": "100 Sak"},
        }

        row_idx = 1
        for v in variants:
            sku = v["variant_sku"]
            vname = v["variant_name"]
            vol = v["unit_multiplier"]
            punit = v["packaging_unit"]

            ref = tier_ref.get(sku, {
                "het": vol * 3800,
                "toko": vol * 2860,
                "ftl": vol * 2660,
                "moq": "50 Kemasan"
            })

            price_rows.append([
                Paragraph(str(row_idx), ParagraphStyle('C', parent=style_tbl_cell, alignment=TA_CENTER)),
                Paragraph(f"<b>{sku}</b>", style_tbl_cell),
                Paragraph(vname, style_tbl_cell_bold),
                Paragraph(f"{vol:g} L ({punit})", ParagraphStyle('C', parent=style_tbl_cell, alignment=TA_CENTER)),
                Paragraph(f"Rp {ref['het']:,.0f}".replace(",", "."), style_tbl_cell_right),
                Paragraph(f"<b>Rp {ref['toko']:,.0f}</b>".replace(",", "."), style_tbl_cell_right),
                Paragraph(f"<b><font color='#059669'>Rp {ref['ftl']:,.0f}</font></b>".replace(",", "."), style_tbl_cell_right),
                Paragraph(str(ref['moq']), ParagraphStyle('C', parent=style_tbl_cell, alignment=TA_CENTER)),
            ])
            row_idx += 1

        price_table = Table(
            price_rows,
            colWidths=[8 * mm, 24 * mm, 48 * mm, 24 * mm, 22 * mm, 22 * mm, 23 * mm, 15 * mm]
        )
        table_style = [
            ('BACKGROUND', (0, 0), (-1, 0), c_primary),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 2.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
            ('BOX', (0, 0), (-1, -1), 1, c_primary),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
        ]
        for r in range(1, len(price_rows)):
            if r % 2 == 0:
                table_style.append(('BACKGROUND', (0, r), (-1, r), c_row_alt))
        price_table.setStyle(TableStyle(table_style))
        story.append(price_table)
        story.append(Spacer(1, 2.5 * mm))

        # -------------------------------------------------------------
        # 3. VOLUME TIERS & PROMOTIONAL INCENTIVES
        # -------------------------------------------------------------
        story.append(Paragraph("<b>2. STRUKTUR INSENTIF VOLUME & KETENTUAN TIERING</b>", style_sec_title))
        story.append(Spacer(1, 1 * mm))

        tier_info = [
            [
                Paragraph("<b>Tier 1: Toko Mitra / Klinik Reguler</b>", style_tbl_cell_bold),
                Paragraph("Pembelian memenuhi Minimum Order Quantity (MOQ). Mendapatkan harga Grosir Toko standar, ongkos kirim standar ditanggung pembeli / sesuai kesepakatan.", style_body)
            ],
            [
                Paragraph("<b>Tier 2: Grosir Menengah (2.000 - 7.999 Liter)</b>", style_tbl_cell_bold),
                Paragraph("Mendapatkan <b>Ekstra Diskon 3%</b> dari subtotal tagihan produk dan subsidi transport parsial Rp 350.000 untuk pengiriman kluster Jawa Timur.", style_body)
            ],
            [
                Paragraph("<b>Tier 3: Full Truckload (FTL >= 8.000 Liter)</b>", ParagraphStyle('FTL', parent=style_tbl_cell_bold, textColor=colors.HexColor("#059669"))),
                Paragraph("Mendapatkan <b>Tarif Distributor Terendah (Tier 2)</b> + <b>FREE ONGKIR / SUBSIDI TRANSPORT PENUH</b> (standar Truk Engkel 8 Ton / Rp 850.000 - Rp 1.500.000).", style_body)
            ],
        ]
        tier_table = Table(tier_info, colWidths=[55 * mm, 131 * mm])
        tier_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), c_bg_light),
            ('BOX', (0, 0), (-1, -1), 0.8, c_secondary),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
            ('TOPPADDING', (0, 0), (-1, -1), 2.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(tier_table)
        story.append(Spacer(1, 2.5 * mm))

        # -------------------------------------------------------------
        # 4. LOGISTICS & SHARED FREIGHT (ESTAFET) TERMS
        # -------------------------------------------------------------
        story.append(Paragraph("<b>3. KETENTUAN PENGIRIMAN & EKSPEDISI GABUNGAN (ESTAFET)</b>", style_sec_title))
        story.append(Spacer(1, 1 * mm))

        logistics_text = (
            "• <b>Program Pengiriman Estafet Bersama:</b> Untuk Kluster Jawa Timur (Tuban, Lamongan, Bojonegoro), "
            "toko dengan pesanan di bawah 8.000 Liter dapat digabungkan dalam satu armada truk yang sama dalam jendela waktu 7 hari, "
            "sehingga biaya ekspedisi dialokasikan secara proporsional volume dan menghemat hingga 40% biaya freight.<br/>"
            "• <b>Armada Resmi:</b> Pengiriman menggunakan Truk Engkel Box (Kapasitas 8.000 L / 8 Ton) atau Truk Fuso (Kapasitas 15.000 L / 15 Ton).<br/>"
            "• <b>Surat Jalan Resmi:</b> Setiap armada dilengkapi Surat Jalan ber-manifest fisik resmi. Penerima wajib menandatangani lembar serah terima barang saat tiba di gudang tujuan."
        )
        story.append(Paragraph(logistics_text, style_body))
        story.append(Spacer(1, 2.5 * mm))

        # -------------------------------------------------------------
        # 5. PAYMENT TERMS & OFFICIAL BANK ACCOUNTS
        # -------------------------------------------------------------
        story.append(Paragraph("<b>4. SYARAT PEMBAYARAN & REKENING RESMI PERUSAHAAN</b>", style_sec_title))
        story.append(Spacer(1, 1 * mm))

        # Primary bank account
        primary_bank = bank_accounts[0] if bank_accounts else {
            "bank_name": "BCA",
            "account_number": "0902207846",
            "account_holder_name": "FINDA FATIKASARI"
        }

        # Build QR Code for Bank Verification
        qr_io = io.BytesIO()
        qr = qrcode.QRCode(version=1, box_size=3, border=1)
        qr_data = f"B2B-VERIFIED:{brand_code}:{primary_bank['bank_name']}:{primary_bank['account_number']}"
        qr.add_data(qr_data)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="black", back_color="white")
        qr_img.save(qr_io, format='PNG')
        qr_io.seek(0)
        qr_flowable = Image(qr_io, width=19 * mm, height=19 * mm)

        bank_details_p = Paragraph(
            f"<b>REKENING PEMBAYARAN RESMI (TUNGGAL):</b><br/>"
            f"Bank: <b>{primary_bank['bank_name']}</b><br/>"
            f"Nomor Rekening: <b><font size='10' color='#1E3A8A'>{primary_bank['account_number']}</font></b><br/>"
            f"Atas Nama: <b>{primary_bank['account_holder_name']}</b><br/>"
            f"<font color='#B91C1C' size='6.5'><b>PERINGATAN KEAMANAN:</b> OmniCat tidak bertanggung jawab atas pembayaran di luar nomor rekening resmi di atas.</font>",
            style_body
        )

        terms_p = Paragraph(
            "<b>KETENTUAN PEMBAYARAN MITRA:</b><br/>"
            "• <b>Mitra Baru:</b> Down Payment (DP) minimal 30% saat penerbitan PO resmi; pelunasan 70% ditransfer sebelum muatan dibongkar di lokasi.<br/>"
            "• <b>Mitra Terverifikasi:</b> Fasilitas Term of Payment (TOP 14 Hari) dapat diberikan setelah evaluasi riwayat kelancaran 3 kali pesanan pertama.<br/>"
            "• <b>Kuitansi Resmi:</b> Bukti pelunasan resmi akan diterbitkan sistem OmniCat secara otomatis setelah dana terverifikasi mutasi bank.",
            style_body
        )

        bank_table = Table([[qr_flowable, bank_details_p, terms_p]], colWidths=[22 * mm, 68 * mm, 96 * mm])
        bank_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
            ('BOX', (0, 0), (-1, -1), 1, c_accent),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#FDE68A")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(bank_table)
        story.append(Spacer(1, 3 * mm))

        # -------------------------------------------------------------
        # 6. SIGN-OFF AUTHORIZATION BLOCKS
        # -------------------------------------------------------------
        sig_data = [
            [
                Paragraph("<b>Dibuat & Disetujui Oleh,</b><br/>Manajemen Distribusi & Penjualan", ParagraphStyle('S1', parent=style_body, alignment=TA_CENTER)),
                Paragraph("<b>Diverifikasi Keuangan,</b><br/>Departemen Keuangan & Pajak", ParagraphStyle('S2', parent=style_body, alignment=TA_CENTER)),
                Paragraph("<b>Diterima & Disetujui Mitra,</b><br/>Pemilik Toko / Pimpinan Klinik", ParagraphStyle('S3', parent=style_body, alignment=TA_CENTER)),
            ],
            [
                Spacer(1, 10 * mm),
                Spacer(1, 10 * mm),
                Spacer(1, 10 * mm),
            ],
            [
                Paragraph(f"<b>( Tim Sales OmniCat )</b><br/>{brand['name']}", ParagraphStyle('S4', parent=style_body, alignment=TA_CENTER)),
                Paragraph(f"<b>( {primary_bank['account_holder_name']} )</b><br/>Finance Director", ParagraphStyle('S5', parent=style_body, alignment=TA_CENTER)),
                Paragraph("<b>( .................................................. )</b><br/>Tanda Tangan & Cap Usaha", ParagraphStyle('S6', parent=style_body, alignment=TA_CENTER)),
            ]
        ]
        sig_table = Table(sig_data, colWidths=[62 * mm, 62 * mm, 62 * mm])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        story.append(sig_table)

        # Build document
        doc.build(story)

        file_size = os.path.getsize(target_path)
        return CatalogPdfResult(
            brand_id=brand["id"],
            brand_code=brand_code,
            brand_name=brand_name,
            format_type="B2B_PRICE_SHEET",
            orientation="PORTRAIT",
            file_path=target_path,
            page_count=1,
            file_size_bytes=file_size,
            has_pricing=True,
            generated_at=datetime.now().isoformat()
        )

