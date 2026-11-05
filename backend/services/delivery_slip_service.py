"""
OMNICAT ENTERPRISE - PROFESSIONAL DELIVERY SLIP (SURAT JALAN) GENERATOR
Generates A4 official logistics delivery slips with physical cargo manifests,
carrier/truck plate numbers, and 3-party handover signatures.
Strictly excludes confidential financial figures (no prices, discounts, or margins).
"""

import os
import io
import uuid
import qrcode
from datetime import datetime, date
from typing import Optional, Dict, Any, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

from backend.database import db
from backend.models import DeliverySlipInput, DeliverySlipResult

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DELIVERY_SLIP_DIR = os.path.join(WORKSPACE_ROOT, "data", "generated_delivery_slips")
os.makedirs(DELIVERY_SLIP_DIR, exist_ok=True)

class DeliverySlipService:
    def __init__(self, database=None):
        self.db = database or db

    def generate_delivery_slip_pdf(
        self,
        slip_input: DeliverySlipInput,
        output_path: Optional[str] = None
    ) -> DeliverySlipResult:
        """
        Generates an official A4 Delivery Slip (Surat Jalan) PDF for logistics truck transport.
        Contains physical cargo breakdown, truck plate, driver name, and 3-party signatures.
        """
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 1. Fetch Order, Customer, Region, Brand, and Invoice metadata
            cur.execute("""
                SELECT 
                    o.id as order_id, o.doc_number, o.order_date, o.notes, o.status,
                    c.name as customer_name, c.owner_doctor_name, c.shipping_address, c.phone as customer_phone,
                    r.name as region_name,
                    b.code as brand_code, b.name as brand_name, b.legal_entity_name, b.address as brand_address, b.phone as brand_phone,
                    inv.invoice_number
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                JOIN regions r ON c.region_id = r.id
                JOIN brands b ON o.brand_id = b.id
                LEFT JOIN invoices inv ON o.id = inv.order_id
                WHERE o.id = ?
            """, (slip_input.order_id,))
            order_data = cur.fetchone()
            if not order_data:
                raise ValueError(f"Order dengan ID '{slip_input.order_id}' tidak ditemukan.")

            # 2. Fetch Order Items & Physical Packaging Specifications
            cur.execute("""
                SELECT 
                    oi.quantity,
                    pv.name as variant_name, pv.sku as variant_sku,
                    pv.packaging_unit, pv.unit_multiplier
                FROM order_items oi
                JOIN product_variants pv ON oi.variant_id = pv.id
                WHERE oi.order_id = ?
                ORDER BY pv.unit_multiplier DESC
            """, (slip_input.order_id,))
            items = cur.fetchall()
            if not items:
                raise ValueError("Pesanan tidak memiliki rincian item produk.")

            doc_no = order_data["doc_number"] or 1
            order_date_str = order_data["order_date"]
            try:
                order_dt = date.fromisoformat(order_date_str[:10])
                year_str = str(order_dt.year)
                formatted_date = order_dt.strftime("%d/%m/%Y")
            except Exception:
                year_str = "2026"
                formatted_date = order_date_str

            reg_code = (order_data["region_name"] or "JTM")[:3].upper()
            brand_code = order_data["brand_code"] or "BC"
            delivery_slip_no = f"SJ/{brand_code}-{reg_code}/{year_str}/{doc_no:03d}"
            inv_number = order_data["invoice_number"] or f"INV/{brand_code}/{year_str}/{doc_no:03d}"

            # Calculate physical logistics totals
            total_packages = sum(it["quantity"] for it in items)
            total_volume = sum(it["quantity"] * it["unit_multiplier"] for it in items)
            estimated_weight_kg = total_volume * 1.0  # Approx 1.0 kg per Liter for bentonite

            # Determine output PDF path
            if not output_path:
                clean_no = delivery_slip_no.replace("/", "_").replace("-", "_")
                output_path = os.path.join(DELIVERY_SLIP_DIR, f"{clean_no}.pdf")

            # 3. Build PDF Document with ReportLab
            doc = SimpleDocTemplate(
                output_path,
                pagesize=A4,
                leftMargin=1.5 * cm,
                rightMargin=1.5 * cm,
                topMargin=1.2 * cm,
                bottomMargin=1.2 * cm
            )

            styles = getSampleStyleSheet()

            # Custom Paragraph Styles
            title_style = ParagraphStyle(
                'SlipTitle',
                parent=styles['Heading1'],
                fontSize=15,
                leading=18,
                textColor=colors.HexColor('#1e1b4b'),
                fontName='Helvetica-Bold',
                alignment=TA_RIGHT
            )
            brand_title_style = ParagraphStyle(
                'BrandTitle',
                parent=styles['Heading2'],
                fontSize=14,
                leading=17,
                textColor=colors.HexColor('#4c1d95'),
                fontName='Helvetica-Bold'
            )
            brand_meta_style = ParagraphStyle(
                'BrandMeta',
                parent=styles['Normal'],
                fontSize=8,
                leading=11,
                textColor=colors.HexColor('#64748b')
            )
            meta_label_style = ParagraphStyle(
                'MetaLabel',
                parent=styles['Normal'],
                fontSize=8,
                leading=11,
                fontName='Helvetica-Bold',
                textColor=colors.HexColor('#475569')
            )
            meta_val_style = ParagraphStyle(
                'MetaVal',
                parent=styles['Normal'],
                fontSize=8.5,
                leading=11.5,
                textColor=colors.HexColor('#0f172a')
            )
            table_cell_style = ParagraphStyle(
                'TableCell',
                parent=styles['Normal'],
                fontSize=8,
                leading=11,
                textColor=colors.HexColor('#1e293b')
            )
            table_header_style = ParagraphStyle(
                'TableHeader',
                parent=styles['Normal'],
                fontSize=8,
                leading=10,
                fontName='Helvetica-Bold',
                textColor=colors.white,
                alignment=TA_CENTER
            )

            story = []

            # A. HEADER: Brand Legal Info & Delivery Slip Title
            header_table_data = [
                [
                    Paragraph(f"<b>{order_data['brand_name'].upper()}</b>", brand_title_style),
                    Paragraph("SURAT JALAN PENGIRIMAN", title_style)
                ],
                [
                    Paragraph(f"{order_data['legal_entity_name'] or 'CV. BentoCat Distribusi Nusantara'}<br/>{order_data['brand_address'] or 'Jawa Timur - Indonesia'}<br/>Telp: {order_data['brand_phone'] or '0812-3456-7890'}", brand_meta_style),
                    Paragraph(f"<b>No. Surat Jalan:</b> {delivery_slip_no}<br/><b>No. Invoice Ref:</b> {inv_number}<br/><b>Tanggal Kirim:</b> {formatted_date}", meta_val_style)
                ]
            ]
            header_table = Table(header_table_data, colWidths=[9.5 * cm, 7.5 * cm])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
            ]))
            story.append(header_table)
            story.append(Spacer(1, 0.4 * cm))
            story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#4c1d95'), spaceAfter=10))

            # B. TWO-COLUMN METADATA (Recipient vs Logistics Transport)
            recipient_info = (
                f"<b>{order_data['customer_name']}</b><br/>"
                f"PIC / Dokter: {order_data['owner_doctor_name'] or '-'}<br/>"
                f"Alamat: {order_data['shipping_address'] or 'Wilayah ' + order_data['region_name']}<br/>"
                f"Telepon: {order_data['customer_phone'] or '-'}"
            )

            carrier_name = slip_input.carrier_name or "Ekspedisi Logistik Truk"
            plate_no = slip_input.vehicle_plate_number or "S 8291 UJ"
            driver_name = slip_input.driver_name or "Sopir Pengiriman"

            logistics_info = (
                f"<b>Armada / Ekspedisi:</b> {carrier_name}<br/>"
                f"<b>No. Polisi Truk:</b> <font color='#4c1d95'><b>{plate_no}</b></font><br/>"
                f"<b>Nama Pengemudi:</b> {driver_name}<br/>"
                f"<b>Catatan Lapangan:</b> {slip_input.notes or order_data['notes'] or 'Muatan aman tersegel utuh'}"
            )

            meta_box_data = [
                [
                    Paragraph("<b>TUJUAN PENGIRIMAN (PENERIMA):</b>", meta_label_style),
                    Paragraph("<b>INFORMASI ARMADA & LOGISTIK:</b>", meta_label_style)
                ],
                [
                    Paragraph(recipient_info, meta_val_style),
                    Paragraph(logistics_info, meta_val_style)
                ]
            ]
            meta_box = Table(meta_box_data, colWidths=[8.5 * cm, 8.5 * cm])
            meta_box.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(meta_box)
            story.append(Spacer(1, 0.4 * cm))

            # C. CARGO MANIFEST TABLE (Strictly NO Prices / COGS)
            cargo_table_data = [
                [
                    Paragraph("No.", table_header_style),
                    Paragraph("Nama Produk & Spesifikasi", table_header_style),
                    Paragraph("Kemasan", table_header_style),
                    Paragraph("Kuantitas Fisik", table_header_style),
                    Paragraph("Volume Satuan", table_header_style),
                    Paragraph("Total Volume", table_header_style),
                    Paragraph("Kondisi Barang", table_header_style)
                ]
            ]

            for idx, it in enumerate(items, 1):
                item_vol = it["quantity"] * it["unit_multiplier"]
                unit_label = it["packaging_unit"] or "Unit"

                cargo_table_data.append([
                    Paragraph(str(idx), ParagraphStyle('Center', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph(f"<b>{it['variant_name']}</b><br/><font color='#64748b'>{it['variant_sku']}</font>", table_cell_style),
                    Paragraph(f"{unit_label}", ParagraphStyle('Center', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph(f"<b>{it['quantity']:,}</b> {unit_label}", ParagraphStyle('Center', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph(f"{it['unit_multiplier']:.1f} Liter", ParagraphStyle('Center', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph(f"<b>{item_vol:,.1f} L</b>", ParagraphStyle('Right', parent=table_cell_style, alignment=TA_RIGHT)),
                    Paragraph("Baik & Tersegel", ParagraphStyle('Center', parent=table_cell_style, alignment=TA_CENTER))
                ])

            # Total Summary Row
            cargo_table_data.append([
                Paragraph("<b>TOTAL LOGISTIK:</b>", ParagraphStyle('TotLabel', parent=table_cell_style, alignment=TA_RIGHT, fontName='Helvetica-Bold')),
                "",
                "",
                Paragraph(f"<b>{total_packages:,} Kemasan</b>", ParagraphStyle('TotQty', parent=table_cell_style, alignment=TA_CENTER, fontName='Helvetica-Bold')),
                "",
                Paragraph(f"<b>{total_volume:,.1f} Liter</b>", ParagraphStyle('TotVol', parent=table_cell_style, alignment=TA_RIGHT, fontName='Helvetica-Bold')),
                Paragraph(f"<b>± {estimated_weight_kg:,.0f} kg</b>", ParagraphStyle('TotWt', parent=table_cell_style, alignment=TA_CENTER, fontName='Helvetica-Bold'))
            ])

            cargo_table = Table(
                cargo_table_data,
                colWidths=[1.0 * cm, 5.0 * cm, 2.2 * cm, 2.5 * cm, 2.0 * cm, 2.3 * cm, 2.0 * cm]
            )
            cargo_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e1b4b')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('SPAN', (0, -1), (2, -1)),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f8fafc')),
            ]))
            story.append(cargo_table)
            story.append(Spacer(1, 0.4 * cm))

            # D. LOGISTICS INSTRUCTION NOTICE
            notice_text = (
                "<b>PERHATIAN & KETENTUAN PENERIMAAN:</b><br/>"
                "1. Harap hitung dan periksa kondisi segel sak/kemasan saat serah terima di lokasi penerima.<br/>"
                "2. Pengemudi/ekspedisi bertanggung jawab penuh atas keutuhan muatan selama perjalanan logistik.<br/>"
                "3. Klaim kerusakan fisik atau selisih kuantitas wajib dicatat pada surat jalan ini dan ditandatangani ketiga pihak."
            )
            notice_box = Table(
                [[Paragraph(notice_text, brand_meta_style)]],
                colWidths=[17.0 * cm]
            )
            notice_box.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fef3c7')),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#f59e0b')),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(notice_box)
            story.append(Spacer(1, 0.5 * cm))

            # E. THREE-PARTY HANDOVER SIGNATURE COLUMNS
            sig_table_data = [
                [
                    Paragraph("<b>PENGIRIM GUDANG</b><br/>Yang Menyerahkan,", ParagraphStyle('SigHead', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph("<b>SOPIR / EKSPEDISI</b><br/>Yang Membawa & Menjaga,", ParagraphStyle('SigHead', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph("<b>PENERIMA (TOKO / KLINIK)</b><br/>Yang Memeriksa & Menerima,", ParagraphStyle('SigHead', parent=table_cell_style, alignment=TA_CENTER))
                ],
                [
                    Spacer(1, 1.8 * cm),
                    Spacer(1, 1.8 * cm),
                    Spacer(1, 1.8 * cm)
                ],
                [
                    Paragraph("( ________________________ )<br/><font color='#64748b'>Staff Logistik BentoCat</font>", ParagraphStyle('SigLine', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph(f"( <b>{driver_name}</b> )<br/><font color='#64748b'>Pengemudi Armada</font>", ParagraphStyle('SigLine', parent=table_cell_style, alignment=TA_CENTER)),
                    Paragraph("( ________________________ )<br/><font color='#64748b'>Cap Toko & Nama Jelas</font>", ParagraphStyle('SigLine', parent=table_cell_style, alignment=TA_CENTER))
                ]
            ]
            sig_table = Table(sig_table_data, colWidths=[5.6 * cm, 5.6 * cm, 5.8 * cm])
            sig_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f8fafc')),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(KeepTogether(sig_table))
            story.append(Spacer(1, 0.4 * cm))

            # F. EMBEDDED DIGITAL VERIFICATION QR CODE & FOOTER WATERMARK
            qr_data = f"OMNICAT-SJ:{delivery_slip_no}|ORDER:{slip_input.order_id}|VOL:{total_volume}|PACK:{total_packages}"
            qr_img = qrcode.make(qr_data)
            qr_buffer = io.BytesIO()
            qr_img.save(qr_buffer, format="PNG")
            qr_buffer.seek(0)

            reportlab_qr = Image(qr_buffer, width=1.8 * cm, height=1.8 * cm)

            footer_meta_text = (
                f"<b>VERIFIKASI LOGISTIK DIGITAL OMNICAT</b><br/>"
                f"<font color='#64748b'>ID Transaksi: {slip_input.order_id}<br/>"
                f"Surat Jalan Resmi BentoCat Distribution Platform • Dicetak: {datetime.now().strftime('%d/%m/%Y %H:%M')}<br/>"
                f"Dokumen sah untuk pengiriman fisik antarkota dan pemeriksaan petugas jalan raya.</font>"
            )

            footer_table_data = [
                [
                    reportlab_qr,
                    Paragraph(footer_meta_text, brand_meta_style)
                ]
            ]
            footer_table = Table(footer_table_data, colWidths=[2.2 * cm, 14.8 * cm])
            footer_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))
            story.append(KeepTogether(footer_table))

            # Build Document
            doc.build(story)

            return DeliverySlipResult(
                order_id=slip_input.order_id,
                delivery_slip_number=delivery_slip_no,
                invoice_number=inv_number,
                doc_number=doc_no,
                customer_name=order_data["customer_name"],
                shipping_address=order_data["shipping_address"] or order_data["region_name"],
                shipping_date=formatted_date,
                total_packages_count=total_packages,
                total_volume_liters=total_volume,
                estimated_weight_kg=estimated_weight_kg,
                pdf_path=output_path
            )
        finally:
            conn.close()
