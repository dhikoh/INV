"""
OMNICAT ENTERPRISE - PROFESSIONAL INVOICE PDF GENERATOR
Generates A4 official invoice documents with ReportLab,
matching historical BentoCat styling, bank accounts, and digital verification QR Code.
"""

import os
import io
import uuid
import qrcode
from datetime import datetime, date
from typing import Optional, Dict, Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

from backend.database import db

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PDF_OUTPUT_DIR = os.path.join(WORKSPACE_ROOT, "data", "generated_invoices")
os.makedirs(PDF_OUTPUT_DIR, exist_ok=True)

class PdfInvoiceService:
    def __init__(self, database=None):
        self.db = database or db

    def generate_invoice_pdf(self, order_id: str, output_path: Optional[str] = None) -> str:
        """
        Generates a professional A4 invoice PDF for an approved order.
        Embeds digital verification QR Code, line items table, and bank payment details.
        """
        conn = self.db.get_connection()
        cur = conn.cursor()
        try:
            # 1. Fetch Order, Customer, Brand, and Invoice Data
            cur.execute("""
                SELECT 
                    o.id as order_id, o.doc_number, o.revision_number, o.order_date,
                    o.total_order_volume, o.gross_product_subtotal, o.discount_amount,
                    o.transport_fee_billed, o.unloading_fee_billed, o.net_invoice_grand_total,
                    o.notes, o.status,
                    c.name as customer_name, c.shipping_address, c.phone as customer_phone,
                    b.code as brand_code, b.name as brand_name, b.legal_entity_name,
                    inv.id as invoice_id, inv.invoice_number, inv.issue_date, inv.due_date,
                    inv.total_amount, inv.amount_paid, inv.payment_status
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                JOIN brands b ON o.brand_id = b.id
                LEFT JOIN invoices inv ON o.id = inv.order_id
                WHERE o.id = ?
            """, (order_id,))
            order_data = cur.fetchone()
            if not order_data:
                raise ValueError(f"Order dengan ID '{order_id}' tidak ditemukan.")

            if not order_data["invoice_number"]:
                raise ValueError("Invoice resmi belum diterbitkan untuk pesanan ini. Order harus di-approve terlebih dahulu.")

            # 2. Fetch Line Items
            cur.execute("""
                SELECT 
                    pv.sku, pv.name as variant_name, pv.packaging_unit,
                    oi.quantity, oi.unit_price, oi.line_subtotal
                FROM order_items oi
                JOIN product_variants pv ON oi.variant_id = pv.id
                WHERE oi.order_id = ?
                ORDER BY pv.unit_multiplier DESC
            """, (order_id,))
            items = cur.fetchall()

            # 3. Fetch Primary Bank Account
            cur.execute("""
                SELECT bank_name, account_number, account_holder_name
                FROM brand_bank_accounts
                WHERE brand_id = (SELECT brand_id FROM orders WHERE id = ?)
                  AND is_primary = 1
                  AND (timelock_until IS NULL OR timelock_until <= CURRENT_TIMESTAMP)
                ORDER BY created_at DESC
                LIMIT 1
            """, (order_id,))
            bank_row = cur.fetchone()
            bank_info = {
                "bank_name": bank_row["bank_name"] if bank_row else "BCA",
                "account_number": bank_row["account_number"] if bank_row else "0902207846",
                "holder_name": bank_row["account_holder_name"] if bank_row else "FINDA FATIKASARI"
            }
        finally:
            conn.close()

        # Target file path
        safe_inv_num = order_data["invoice_number"].replace("/", "_")
        pdf_filename = f"{safe_inv_num}.pdf"
        target_path = output_path or os.path.join(PDF_OUTPUT_DIR, pdf_filename)

        # 4. Generate QR Code in-memory
        verify_url = f"https://omnicat.bentocat.com/verify/inv/{safe_inv_num}?val={order_data['net_invoice_grand_total']:.0f}"
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=6,
            border=1
        )
        qr.add_data(verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color="#1A365D", back_color="white")
        qr_buffer = io.BytesIO()
        qr_img.save(qr_buffer, format="PNG")
        qr_buffer.seek(0)

        # 5. Build PDF Document
        doc = SimpleDocTemplate(
            target_path,
            pagesize=A4,
            leftMargin=1.5 * cm,
            rightMargin=1.5 * cm,
            topMargin=1.2 * cm,
            bottomMargin=1.2 * cm
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'BrandTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=20,
            textColor=colors.HexColor('#1A365D')
        )

        subtitle_style = ParagraphStyle(
            'DocSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=16,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#2B6CB0')
        )

        meta_right_style = ParagraphStyle(
            'MetaRight',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=13,
            alignment=TA_RIGHT,
            textColor=colors.HexColor('#4A5568')
        )

        body_style = ParagraphStyle(
            'CustBody',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=13,
            textColor=colors.HexColor('#2D3748')
        )

        body_bold = ParagraphStyle(
            'CustBodyBold',
            parent=body_style,
            fontName='Helvetica-Bold'
        )

        table_header_style = ParagraphStyle(
            'TableHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.white
        )

        table_cell_style = ParagraphStyle(
            'TableCell',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor('#2D3748')
        )

        table_cell_right = ParagraphStyle(
            'TableCellRight',
            parent=table_cell_style,
            alignment=TA_RIGHT
        )

        table_cell_center = ParagraphStyle(
            'TableCellCenter',
            parent=table_cell_style,
            alignment=TA_CENTER
        )

        elements = []

        # Header Table: Brand on Left, Document Metadata on Right
        header_table_data = [
            [
                Paragraph(f"<b>{order_data['brand_name'].upper()}</b><br/><font size=8 color='#718096'>{order_data['legal_entity_name']}</font>", title_style),
                Paragraph(
                    f"<b>No dok:</b> {order_data['doc_number'] or '-'} &nbsp;&nbsp; "
                    f"<b>Tgl. Terbit:</b> {order_data['issue_date']}<br/>"
                    f"<b>Revisi :</b> {order_data['revision_number']} &nbsp;&nbsp; <b>Hal:</b> 1/1",
                    meta_right_style
                )
            ]
        ]
        header_table = Table(header_table_data, colWidths=[10 * cm, 8 * cm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(header_table)
        elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#1A365D'), spaceAfter=8))

        # Title: ORDER CONFIRMATION / INVOICE
        elements.append(Paragraph("<b>ORDER CONFIRMATION / INVOICE</b>", subtitle_style))
        elements.append(Spacer(1, 6))

        # Customer & Shipping Details Box
        cust_box_data = [
            [
                Paragraph(f"<b>Nama:</b> {order_data['customer_name']}", body_style),
                Paragraph(f"<b>Invoice #:</b> {order_data['invoice_number']}", body_style)
            ],
            [
                Paragraph(f"<b>Alamat:</b> {order_data['shipping_address']}", body_style),
                Paragraph(f"<b>Tgl. Pemesanan:</b> {order_data['order_date']}", body_style)
            ],
            [
                Paragraph(f"<b>No. Telepon:</b> {order_data['customer_phone'] or '-'}", body_style),
                Paragraph(f"<b>Jatuh Tempo:</b> {order_data['due_date']}", body_style)
            ],
            [
                Paragraph(f"<b>Catatan / Job:</b> {order_data['notes'] or 'Repeat Order'}", body_style),
                Paragraph(f"<b>Status Pembayaran:</b> <font color='#2B6CB0'><b>{order_data['payment_status']}</b></font>", body_style)
            ]
        ]
        cust_table = Table(cust_box_data, colWidths=[11 * cm, 7 * cm])
        cust_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F7FAFC')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(cust_table)
        elements.append(Spacer(1, 10))

        # Line Items Table
        items_table_data = [
            [
                Paragraph("<b>Kode</b>", table_header_style),
                Paragraph("<b>Nama Barang</b>", table_header_style),
                Paragraph("<b>Kuantitas</b>", table_header_style),
                Paragraph("<b>Satuan</b>", table_header_style),
                Paragraph("<b>Harga Satuan</b>", table_header_style),
                Paragraph("<b>Jumlah</b>", table_header_style),
            ]
        ]

        for it in items:
            items_table_data.append([
                Paragraph(it["sku"], table_cell_center),
                Paragraph(it["variant_name"], table_cell_style),
                Paragraph(f"{it['quantity']:,}", table_cell_center),
                Paragraph(it["packaging_unit"].replace("_", " ").lower(), table_cell_center),
                Paragraph(f"Rp {it['unit_price']:,.0f}", table_cell_right),
                Paragraph(f"Rp {it['line_subtotal']:,.0f}", table_cell_right),
            ])

        items_table = Table(
            items_table_data,
            colWidths=[2.2 * cm, 6.5 * cm, 2.0 * cm, 2.0 * cm, 2.5 * cm, 2.8 * cm]
        )
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1A365D')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 8))

        # Financial Calculations Summary (Right aligned)
        summary_rows = [
            [Paragraph("Tagihan Produk", table_cell_style), Paragraph(f"Rp {order_data['gross_product_subtotal']:,.0f}", table_cell_right)]
        ]

        if order_data["discount_amount"] > 0:
            summary_rows.append([
                Paragraph("<font color='#E53E3E'>Diskon Harga Produk (Promo)</font>", table_cell_style),
                Paragraph(f"<font color='#E53E3E'>-Rp {order_data['discount_amount']:,.0f}</font>", table_cell_right)
            ])

        if order_data["transport_fee_billed"] > 0:
            summary_rows.append([
                Paragraph("Biaya Transport (Ongkir)", table_cell_style),
                Paragraph(f"Rp {order_data['transport_fee_billed']:,.0f}", table_cell_right)
            ])

        if order_data["unloading_fee_billed"] > 0:
            summary_rows.append([
                Paragraph("Biaya Tim Bongkar", table_cell_style),
                Paragraph(f"Rp {order_data['unloading_fee_billed']:,.0f}", table_cell_right)
            ])

        summary_rows.append([
            Paragraph("<b>Total Tagihan</b>", ParagraphStyle('TotBold', parent=body_bold, fontSize=10, textColor=colors.HexColor('#1A365D'))),
            Paragraph(f"<b>Rp {order_data['net_invoice_grand_total']:,.0f}</b>", ParagraphStyle('TotVal', parent=table_cell_right, fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#1A365D')))
        ])

        summary_table = Table(summary_rows, colWidths=[6.5 * cm, 3.5 * cm], hAlign='RIGHT')
        summary_table.setStyle(TableStyle([
            ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#1A365D')),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#EDF2F7')),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 10))

        # Footer Table: Bank Payment Instructions (Left) + Verification QR Code (Right)
        bank_p = Paragraph(
            f"<b>Catatan & Instruksi Pembayaran:</b><br/>"
            f"1. Transfer ke Rekening <b>{bank_info['bank_name']}</b>: <b>{bank_info['account_number']}</b><br/>"
            f"&nbsp;&nbsp;&nbsp;&nbsp;atas nama <b>{bank_info['holder_name']}</b><br/>"
            f"2. Antrian armada pabrik diproses terhitung tanggal Down Payment (DP).<br/>"
            f"3. Dokumen ini sah dan terdaftar dalam sistem distribusi OmniCat.",
            ParagraphStyle('BankStyle', parent=body_style, fontSize=8, leading=11, textColor=colors.HexColor('#4A5568'))
        )

        qr_image = Image(qr_buffer, width=2.4 * cm, height=2.4 * cm)

        sign_p = Paragraph(
            f"<font size=8 color='#718096'>Blitar, {order_data['issue_date']}<br/>"
            f"<b>{order_data['brand_name']}</b><br/><br/><br/>"
            f"<i>(Digital Verified via QR)</i></font>",
            ParagraphStyle('SignStyle', parent=styles['Normal'], alignment=TA_CENTER)
        )

        footer_table_data = [
            [bank_p, qr_image, sign_p]
        ]
        footer_table = Table(footer_table_data, colWidths=[9.5 * cm, 3.2 * cm, 5.3 * cm])
        footer_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (1, 0), (1, 0), 'CENTER'),
            ('BOX', (0, 0), (0, 0), 0.5, colors.HexColor('#CBD5E0')),
            ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#F7FAFC')),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (0, 0), 6),
            ('RIGHTPADDING', (0, 0), (0, 0), 6),
        ]))

        elements.append(footer_table)

        # Build PDF
        doc.build(elements)

        # Update pdf_storage_path in database
        with self.db.transaction() as cur:
            cur.execute("""
                UPDATE invoices
                SET pdf_storage_path = ?
                WHERE order_id = ?
            """, (target_path, order_id))

        return target_path
