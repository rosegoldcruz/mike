"""
Cabinet Bidding Dashboard - FastAPI Backend
Handles CSV data loading, quote calculation (Mike-Logic), and file parsing.
"""

import os
import re
import io
import math
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd

# ─── Configuration & Mike-Logic Constants ───────────────────────────────────────
FACTOR = 0.126
BUILD_COST_PER_BOX = 20.0
SHIPPING_PER_UNIT = 125.0
INSTALL_PER_BOX = 79.0

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ALBERT_CSV = os.path.join(BASE_DIR, "Albert_Master_Definitive.csv")
HCI_CSV = os.path.join(BASE_DIR, "HCI_Master_Definitive.csv")

# ─── App Initialization ────────────────────────────────────────────────────────
app = FastAPI(title="Cabinet Bidding Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Data Loading ──────────────────────────────────────────────────────────────
def load_csv_data():
    albert_df = pd.read_csv(ALBERT_CSV)
    hci_df = pd.read_csv(HCI_CSV)
    # Clean column names
    albert_df.columns = [c.strip() for c in albert_df.columns]
    hci_df.columns = [c.strip() for c in hci_df.columns]
    # Clean SKU column
    albert_df['SKU'] = albert_df['SKU'].astype(str).str.strip()
    hci_df['SKU'] = hci_df['SKU'].astype(str).str.strip()
    return albert_df, hci_df

albert_df, hci_df = load_csv_data()

# Build SKU nomenclature mappings for Albert (Frameless)
# Maps simplified names (e.g. "B12") to their "FD" variants (e.g. "B12FD")
def build_albert_sku_map(df):
    """Build a mapping of short SKUs to their FD variant for Albert cabinets."""
    sku_map = {}
    all_skus = set(df['SKU'].values)
    for sku in all_skus:
        if sku.endswith('FD') or sku.endswith('FHD'):
            base = sku.replace('FHD', '').replace('FD', '')
            sku_map[base] = sku
    return sku_map

albert_sku_map = build_albert_sku_map(albert_df)

# ─── Models ────────────────────────────────────────────────────────────────────
class LineItem(BaseModel):
    sku: str
    quantity: float

class QuoteRequest(BaseModel):
    brand: str  # "Frameless" or "Framed"
    finish: str
    margin: float  # 0-50 as percentage
    items: List[LineItem]
    include_install: bool = False
    # Customizable rate overrides (defaults match original Mike-Logic)
    factor: float = 0.126
    build_rate: float = 20.0
    shipping_rate: float = 125.0
    install_rate: float = 79.0
    handle_price: float = 2.75
    discount_pct: float = 0.0  # 0-100, applied after margin

class QuoteLineResult(BaseModel):
    sku: str
    resolved_sku: str
    quantity: float
    unit_price: float
    line_total: float
    is_box: bool
    found: bool

class QuoteResult(BaseModel):
    lines: List[QuoteLineResult]
    total_list_price: float
    box_count: float
    cabinet_revenue: float
    build_cost: float
    shipping_cost: float
    install_cost: float
    base_cost: float
    margin_percent: float
    bid_price: float
    discount_pct: float
    discount_amount: float
    grand_total: float
    # Echo back the rates used so frontend stays in sync
    factor_used: float
    build_rate_used: float
    shipping_rate_used: float
    install_rate_used: float

# ─── Box Detection ─────────────────────────────────────────────────────────────
BOX_PREFIXES = ['B', 'W', 'SB', 'DB', 'V', 'PC', 'MOC', 'FSB', 'FSM',
                'BBC', 'BLS', 'WDC', 'WBC', 'WBF', 'WER', 'VDB', 'VSB',
                'BTC', 'BSR', 'CSB', 'OC', 'WEC', 'WES', 'WMC', 'WRC',
                'VSD', 'SVA', 'BEC', 'BES', 'WLS', 'DV', 'SP', 'BWRC',
                '2DB', '3DB']

def is_box_sku(sku: str) -> bool:
    """Determine whether a SKU represents a box (cabinet unit) for box-count pricing."""
    upper = sku.upper().lstrip('*')
    for prefix in sorted(BOX_PREFIXES, key=len, reverse=True):
        if upper.startswith(prefix.upper()):
            return True
    return False

# ─── SKU Resolution ────────────────────────────────────────────────────────────
def resolve_sku(sku: str, brand: str, df: pd.DataFrame) -> str:
    """Resolve a SKU, trying exact match then Albert FD mapping."""
    clean = sku.strip()
    if clean in df['SKU'].values:
        return clean
    # Try with asterisk prefix for special items
    if f"*{clean}" in df['SKU'].values:
        return f"*{clean}"
    # Albert-specific: try FD/FHD suffix
    if brand == "Frameless":
        if clean in albert_sku_map:
            return albert_sku_map[clean]
        if f"{clean}FD" in df['SKU'].values:
            return f"{clean}FD"
        if f"{clean}FHD" in df['SKU'].values:
            return f"{clean}FHD"
    # HCI-specific: try FHD suffix
    if brand == "Framed":
        if f"{clean}FHD" in df['SKU'].values:
            return f"{clean}FHD"
    return clean  # Return original if no resolution found

# ─── Routes ────────────────────────────────────────────────────────────────────
@app.get("/api/brands")
def get_brands():
    """Return available brands and their finishes."""
    albert_finishes = [c for c in albert_df.columns if c != 'SKU']
    hci_finishes = [c for c in hci_df.columns if c != 'SKU']
    return {
        "brands": [
            {"name": "Frameless", "label": "Frameless (Albert)", "finishes": albert_finishes},
            {"name": "Framed", "label": "Framed (HCI)", "finishes": hci_finishes},
        ]
    }

@app.get("/api/skus")
def get_skus(brand: str):
    """Return all SKUs for a given brand."""
    df = albert_df if brand == "Frameless" else hci_df
    skus = df['SKU'].tolist()
    return {"skus": skus}

@app.post("/api/quote", response_model=QuoteResult)
def calculate_quote(request: QuoteRequest):
    """Calculate a full quote using Mike-Logic."""
    df = albert_df if request.brand == "Frameless" else hci_df
    margin = request.margin / 100.0
    finish = request.finish

    if finish not in df.columns:
        raise HTTPException(status_code=400, detail=f"Finish '{finish}' not found in {request.brand} data")

    lines: List[QuoteLineResult] = []
    total_list = 0.0
    box_count = 0.0

    for item in request.items:
        resolved = resolve_sku(item.sku, request.brand, df)
        found = resolved in df['SKU'].values
        unit_price = 0.0
        
        if found:
            price_val = df.loc[df['SKU'] == resolved, finish].values[0]
            try:
                unit_price = float(price_val) if pd.notna(price_val) and str(price_val).strip() != '' else 0.0
            except (ValueError, TypeError):
                unit_price = 0.0

        line_total = unit_price * item.quantity
        total_list += line_total
        
        is_box = is_box_sku(item.sku)
        if is_box:
            box_count += item.quantity

        lines.append(QuoteLineResult(
            sku=item.sku,
            resolved_sku=resolved,
            quantity=item.quantity,
            unit_price=unit_price,
            line_total=line_total,
            is_box=is_box,
            found=found,
        ))

    # Mike-Logic calculation (using request-level overrides)
    cabinet_revenue = total_list * request.factor
    build_cost = box_count * request.build_rate
    shipping_cost = request.shipping_rate
    install_cost = (box_count * request.install_rate) if request.include_install else 0.0
    base_cost = cabinet_revenue + build_cost + shipping_cost + install_cost
    bid_price = base_cost / (1 - margin) if margin < 1 else base_cost

    # Apply discount after margin
    discount = request.discount_pct / 100.0
    discount_amount = bid_price * discount
    grand_total = bid_price - discount_amount

    return QuoteResult(
        lines=lines,
        total_list_price=total_list,
        box_count=box_count,
        cabinet_revenue=round(cabinet_revenue, 2),
        build_cost=round(build_cost, 2),
        shipping_cost=round(shipping_cost, 2),
        install_cost=round(install_cost, 2),
        base_cost=round(base_cost, 2),
        margin_percent=request.margin,
        bid_price=round(bid_price, 2),
        discount_pct=request.discount_pct,
        discount_amount=round(discount_amount, 2),
        grand_total=round(grand_total, 2),
        factor_used=request.factor,
        build_rate_used=request.build_rate,
        shipping_rate_used=request.shipping_rate,
        install_rate_used=request.install_rate,
    )

# ─── File Upload / Vision AI ──────────────────────────────────────────────────
# Known cabinet code patterns from both CSVs
ALL_SKUS = set(albert_df['SKU'].tolist() + hci_df['SKU'].tolist())
# Build a regex pattern for SKU-like codes
SKU_PATTERN = re.compile(
    r'\b('
    r'(?:\*)?'  # optional asterisk
    r'(?:FVSB|FSB|FSM|BTC|BLS|BBC|BSR|MOC|VDB|VSB|VSD|VDK|WDC|WBC|WBF|WER|WSL|WLS|WEC|WES|WMC|WRC|BEC|BES|SVA|CSB|BWRC|BWBK|3DB|2DB|'
    r'LINEN|MWEP|MBEP|REF|TEP|DWR|WEP|VEP|BEP|ROT|'
    r'PC|OC|SB|B|W|V)'
    r'\d[\w\-\.\/]*'
    r')\b',
    re.IGNORECASE
)

@app.post("/api/parse-file")
async def parse_file(file: UploadFile = File(...)):
    """Parse an uploaded file (PDF, JPG, TXT) and extract cabinet codes."""
    filename = file.filename.lower()
    content_bytes = await file.read()
    text = ""

    try:
        if filename.endswith('.pdf'):
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(io.BytesIO(content_bytes))
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            except Exception as e:
                text = f"PDF parse error: {e}"
        elif filename.endswith(('.jpg', '.jpeg', '.png', '.bmp', '.tiff')):
            try:
                from PIL import Image
                import pytesseract
                image = Image.open(io.BytesIO(content_bytes))
                text = pytesseract.image_to_string(image)
            except Exception:
                text = "OCR not available. Tesseract not installed."
        elif filename.endswith('.txt') or filename.endswith('.csv'):
            text = content_bytes.decode('utf-8', errors='replace')
        else:
            text = content_bytes.decode('utf-8', errors='replace')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing file: {e}")

    # Extract SKU codes from parsed text
    found_codes = SKU_PATTERN.findall(text)
    
    # Count occurrences
    sku_counts = {}
    for code in found_codes:
        code_upper = code.upper().strip()
        sku_counts[code_upper] = sku_counts.get(code_upper, 0) + 1

    # Return SKU lines for the input area
    sku_lines = [f"{sku}, {qty}" for sku, qty in sku_counts.items()]

    return {
        "raw_text": text[:2000],  # First 2000 chars for preview
        "found_skus": sku_counts,
        "sku_lines": sku_lines,
        "total_found": len(found_codes),
    }

@app.get("/api/health")
def health():
    return {"status": "ok", "albert_skus": len(albert_df), "hci_skus": len(hci_df)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
