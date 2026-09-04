"""OCR service. Run separately from Node: python python/ocr_server.py"""
import base64
import json
import os
import re
import statistics
import tempfile
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pymupdf
import pytesseract
import requests
from PIL import Image

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

HOST = os.getenv("PYTHON_OCR_HOST", "127.0.0.1")
PORT = int(os.getenv("PYTHON_OCR_PORT", "8001"))
MAX_MB = 15
OCR_DPI = 300
TESSERACT_CANDIDATES = [
    os.getenv("tesseract_cmd", ""),
    shutil.which("tesseract") or "",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
]
for tesseract_path in TESSERACT_CANDIDATES:
    if tesseract_path and Path(tesseract_path).exists():
        pytesseract.pytesseract.tesseract_cmd = tesseract_path
        break
FIELDS = {
    "PI": ["Số HĐ", "Ngày HĐ PI", "Nhà cung cấp", "XUẤT XỨ", "Cảng đến", "Tên hàng", "Giá tổng"],
    "INV": ["INV", "Ngày INV"],
    "PKL": ["Số hộp", "Trọng lượng", "Trọng lượng cả bì"],
    "BILL": ["BL NO.", "Số Container", "Hãng tàu", "ETD", "Cảng đến"],
}
RULES = {
    "PI": "Số HĐ là mã PI/order; ngày là ngày Proforma Invoice; nhà cung cấp là công ty phát hành; XUẤT XỨ là quốc gia; Cảng đến lấy từ destination/POD/port of discharge; Giá tổng chỉ lấy TOTAL/TOTAL AMOUNT, không tự tính.",
    "INV": "INV chỉ lấy Invoice Number/Invoice No.; ngày lấy Invoice Date/Date. Không lấy Customer Code, VAT, Tax, EAN, ORDER, PI hoặc barcode nếu không được gán rõ.",
    "PKL": "Số hộp lấy tổng CAJAS/BOXES; Trọng lượng lấy NET WEIGHT; Trọng lượng cả bì lấy GROSS WEIGHT. Không tự tính, không lấy pallet/TARE.",
    "BILL": "BL NO. là mã chứng từ vận tải; Số Container là mã container; Hãng tàu là carrier/shipping line, không phải tên tàu; ETD là ngày khởi hành, không lấy ETA; Cảng đến lấy từ Port of Discharge/POD, Final Destination hoặc Place of Delivery, không lấy Port of Loading.",
}

# Danh sách tên chuẩn chỉ được cung cấp cho Agent 3 để đối chiếu theo ngữ cảnh OCR.
CARRIER_NAMES = [
    {"name": "Hapag-Lloyd", "aliases": ["happ", "hapag", "hapag-lloyd", "hapag lloyd"]},
    {"name": "Maersk", "aliases": ["maersk", "a.p. moller", "apm"]},
    {"name": "MSC", "aliases": ["msc", "mediterranean shipping"]},
    {"name": "CMA CGM", "aliases": ["cma", "cma cgm"]},
    {"name": "COSCO", "aliases": ["cosco", "cosco shipping"]},
    {"name": "HMM", "aliases": ["hmm", "hyundai merchant marine"]},
    {"name": "FESCO", "aliases": ["fesco"]},
    {"name": "Yang Ming", "aliases": ["yang ming", "yangming", "yml"]},
    {"name": "CKLINE", "aliases": ["ckline", "ck line", "ckl"]},
    {"name": "EVERGREEN", "aliases": ["evergreen", "evergreen marine", "ever", "emc", "shipmentlink"]},
    {"name": "ONE", "aliases": ["one", "one cargo"]},
    {"name": "OOCL", "aliases": ["oocl", "oocl shipping"]},
    {"name": "PIL", "aliases": ["pil", "pacific international lines"]},
    {"name": "SINOKOR", "aliases": ["sinokor", "sinokor shipping"]},
]
SUPPLIER_NAMES = [
    {"name": "Rexach", "aliases": ["REIXACH","rexacha", "escorxador frigorific rexach sl"]},
    {"name": "ELPOZO", "aliases": ["elpozo"]},
    {"name": "TONNIES", "aliases": ["tonnies"]},
    {"name": "SEARA", "aliases": ["seara"]},
    {"name": "DLA&Associates Inc", "aliases": ["dla associates", "dla&associates"]},
    {"name": "Vetracom", "aliases": ["vetracom"]},
    {"name": "Patel", "aliases": ["patel"]},
]


def key():
    value = (os.getenv("open_router_key") or os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not value:
        raise ValueError("Thiếu open_router_key trong .env")
    return value


def doc_type(value):
    value = str(value or "").strip().upper()
    if value == "BL": value = "BILL"
    if value not in FIELDS: raise ValueError("documentType phải là PI, INV, PKL, BL hoặc Bill")
    return value


def date_value(value):
    value = str(value or "").strip()
    match = re.search(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b", value)
    if match:
        year, month, day = match.groups()
        return f"{int(day):02d}/{int(month):02d}/{year}"
    match = re.search(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b", value)
    if match:
        day, month, year = match.groups()
        return f"{int(day):02d}/{int(month):02d}/{year}"
    return value


def ocr_file(path):
    texts, confidences, used_ocr = [], [], False
    with pymupdf.open(path) as pdf:
        for page in pdf:
            text = page.get_text("text", sort=True).strip()
            if text:
                texts.append(text); confidences.append(100); continue
            used_ocr = True
            try:
                pytesseract.get_tesseract_version()
            except Exception as error:
                raise RuntimeError(
                    "Tesseract chưa được cài hoặc chưa có trong PATH. "
                    "Hãy cài Tesseract OCR rồi khởi động lại Python server."
                ) from error
            pixmap = page.get_pixmap(dpi=OCR_DPI, alpha=False)
            image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
            try:
                language = "eng+vie" if "vie" in pytesseract.get_languages(config="") else "eng"
            except Exception:
                language = "eng"
            result = pytesseract.image_to_data(image, lang=language, config="--psm 6", output_type=pytesseract.Output.DICT)
            words, page_conf = [], []
            for word, confidence in zip(result["text"], result["conf"]):
                if str(word).strip(): words.append(str(word).strip())
                try:
                    if float(confidence) >= 0: page_conf.append(float(confidence))
                except (TypeError, ValueError): pass
            texts.append(" ".join(words)); confidences.append(statistics.mean(page_conf) if page_conf else 0)
    text = "\n\n--- TRANG TIẾP THEO ---\n\n".join(texts).strip()
    if not text: raise ValueError("Không đọc được nội dung từ file")
    return text, statistics.mean(confidences) if confidences else 0, used_ocr


def parse_json(content, fields):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(content).strip(), flags=re.I)
    start = text.find("{")
    data = json.JSONDecoder().raw_decode(text[start:])[0] if start >= 0 else None
    if not data: raise ValueError("AI không trả về JSON hợp lệ")
    result = {field: str(data.get(field, "") or "").strip() for field in fields}
    for field in result:
        if "Ngày" in field or field == "ETD": result[field] = date_value(result[field])
    try: result["_confidence"] = float(data.get("_confidence", 0) or 0)
    except (TypeError, ValueError): result["_confidence"] = 0
    result["_reason"] = str(data.get("_reason", "") or "").strip()
    return result


def ask(prompt, model):
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"},
        json={"model": model, "temperature": 0, "max_tokens": 1024,
              "response_format": {"type": "json_object"},
              "messages": [{"role": "user", "content": prompt}]}, timeout=120,
    )
    if not response.ok: raise RuntimeError(f"OpenRouter lỗi {response.status_code}: {response.text[:500]}")
    return response.json()["choices"][0]["message"]["content"]


def prompt(kind, text, instruction, previous=""):
    fields = json.dumps(FIELDS[kind], ensure_ascii=False)
    return f"""{instruction}
Loại chứng từ: {kind}. Trả về JSON hợp lệ, không markdown, đúng các key {fields}, _confidence, _reason.
Chỉ lấy giá trị có trong OCR; không đoán, không tính, không sửa mã. Nếu không chắc chắn trả chuỗi rỗng. Giữ số 0 đầu và ký tự. Chỉ đổi ngày sang DD/MM/YYYY.
Quy tắc: {RULES[kind]}
Kết quả trước đó (chỉ dùng để kiểm tra): {previous}
NỘI DUNG OCR:
{text[:30000]}"""


def analyze(payload):
    kind = doc_type(payload.get("documentType"))
    filename = str(payload.get("fileName") or "document.pdf")
    if not filename.lower().endswith(".pdf"): raise ValueError("Chỉ hỗ trợ file PDF")
    encoded = re.sub(r"^data:application/pdf;base64,", "", str(payload.get("fileData") or "").strip(), flags=re.I)
    if not encoded: raise ValueError("Thiếu fileData")
    try: raw = base64.b64decode(re.sub(r"\s", "", encoded), validate=True)
    except Exception as error: raise ValueError(f"fileData không phải Base64 hợp lệ: {error}")
    if len(raw) > MAX_MB * 1024 * 1024: raise ValueError(f"File vượt quá {MAX_MB}MB")
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp:
            temp.write(raw); temp_path = temp.name
        text, ocr_confidence, used_ocr = ocr_file(temp_path)
        models = {"extract": os.getenv("open_router_model_extract", "openai/gpt-4.1-mini"),
                  "verify": os.getenv("open_router_model_verify", "openai/gpt-4o-mini"),
                  "compare": os.getenv("open_router_model_compare", "openai/gpt-4o-mini")}
        extracted = parse_json(ask(prompt(kind, text, "Bạn là Agent 1, hãy trích xuất dữ liệu."), models["extract"]), FIELDS[kind])
        verified = parse_json(ask(prompt(kind, text, "Bạn là Agent 2, kiểm tra độc lập kết quả Agent 1 và chỉ giữ giá trị có bằng chứng rõ.", json.dumps(extracted, ensure_ascii=False)), models["verify"]), FIELDS[kind])
        carrier_names = [carrier["name"] for carrier in CARRIER_NAMES]
        supplier_names = [supplier["name"] for supplier in SUPPLIER_NAMES]
        compare_instruction = f"""Bạn là Agent 3, kiểm tra toàn bộ OCR và kết quả Agent 1/Agent 2 rồi trả về kết quả cuối.
Chỉ chọn giá trị có bằng chứng trong OCR và đã xuất hiện ở Agent 1 hoặc Agent 2; không phát minh dữ liệu mới.
Sau khi chọn đúng giá trị, hãy chuẩn hóa ngay trong kết quả cuối:
- Hãng tàu phải dùng đúng name chuẩn trong danh sách này: {json.dumps(carrier_names, ensure_ascii=False)}. Nếu Agent 1/2 có tên đầy đủ hoặc biến thể alias của cùng hãng, chọn đúng name tương ứng; không chọn tên tàu/voyage thay cho hãng tàu.
- Nhà cung cấp nếu khớp một nhà cung cấp trong danh sách chuẩn này thì trả đúng name: {json.dumps(supplier_names, ensure_ascii=False)}. Cụ thể 'Escorxador frigorific Rexach SL' phải ghi ngắn là 'Rexach'. Nếu không khớp danh sách, giữ tên nhà cung cấp có bằng chứng rõ trong OCR, không tự bịa tên viết tắt.
- Cảng đến chuẩn hóa về đúng một trong: 'Cat Lai', 'Hai Phong', 'HCM' khi OCR thể hiện các biến thể tương ứng (kể cả khác dấu, HO CHI MINH CITY/HCMC, Cát Lai, Hải Phòng). Không lấy Port of Loading làm Cảng đến.
Việc chuẩn hóa được phép làm thay đổi cách viết của giá trị đã chọn, nhưng không được đổi sang một giá trị không có căn cứ.
"""
        compared = parse_json(ask(prompt(kind, text, compare_instruction, json.dumps({"agent1": extracted, "agent2": verified}, ensure_ascii=False)), models["compare"]), FIELDS[kind])
        # Agent 3 là nơi chọn và chuẩn hóa kết quả cuối; không hậu xử lý cứng bằng Python.
        final = {field: compared.get(field, "") for field in FIELDS[kind]}
        confidence = min(extracted.get("_confidence", 0), verified.get("_confidence", 0), compared.get("_confidence", 0))
        return {"success": True, "documentType": "BL" if kind == "BILL" else kind, "fileName": filename,
                "data": final, "_confidence": confidence, "_reason": compared.get("_reason", ""),
                "ocrConfidence": ocr_confidence, "usedLocalOcr": used_ocr, "models": models}
    finally:
        if temp_path: Path(temp_path).unlink(missing_ok=True)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/ocr/analyze": return self.reply(404, {"success": False, "message": "Route not found"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            self.reply(200, analyze(json.loads(self.rfile.read(length))))
        except Exception as error: self.reply(400, {"success": False, "message": str(error)})

    def reply(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def log_message(self, fmt, *args): print(f"[OCR] {fmt % args}")


if __name__ == "__main__":
    print(f"Python OCR server running at http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
