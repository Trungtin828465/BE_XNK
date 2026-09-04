"""OCR service. Run separately from Node: python python/ocr_server.py"""
import base64
import json
import os
import re
import statistics
import tempfile
import shutil
from io import BytesIO
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
# Giữ cùng cấu hình với bản OCR Python gốc.
OCR_DPI = 400
MAX_OCR_PIXELS = 50_000_000
Image.MAX_IMAGE_PIXELS = 300_000_000
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
    "PKL": "Số hộp: chỉ lấy tổng CAJAS/BOXES. Trọng lượng: lấy NET WEIGHT/trọng lượng tịnh. Trọng lượng cả bì: lấy GROSS WEIGHT/PESO BRUTO. Không tính toán hoặc đổi chỗ hai giá trị; thiếu nhãn tương ứng thì để trống. Không lấy pallet/TARE.",
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
    {"name": "REIXACH", "country": "Spain", "aliases": ["Rexach", "rexacha", "escorxador frigorific rexach sl"]},
    {"name": "ELPOZO", "country": "Spain", "aliases": ["elpozo"]},
    {"name": "TONNIES", "country": "Germany", "aliases": ["tonnies"]},
    {"name": "SEARA", "country": "Netherlands", "aliases": ["seara"]},
    {"name": "DLA&Associates Inc", "country": "Canada", "aliases": ["dla associates", "dla&associates"]},
    # Vetracom là đơn vị trung gian: XUẤT XỨ phải lấy từ nội dung hàng hóa trong PI.
    {"name": "Vetracom", "country": None, "aliases": ["vetracom"]},
    {"name": "Patel", "country": "Spain", "aliases": ["patel"]},
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


def ocr_languages():
    """Chọn ngôn ngữ Tesseract theo dữ liệu thật sự đã cài trên máy."""
    try:
        return "eng+vie" if "vie" in pytesseract.get_languages(config="") else "eng"
    except Exception:
        return "eng"


def prepare_image(image):
    """Giới hạn kích thước ảnh để tránh Tesseract xử lý quá nặng."""
    pixels = image.width * image.height
    if pixels <= MAX_OCR_PIXELS:
        return image
    scale = (MAX_OCR_PIXELS / pixels) ** 0.5
    size = (max(1, int(image.width * scale)), max(1, int(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def ocr_image(image):
    """OCR nhưng vẫn giữ dòng và vị trí tương đối của bảng chứng từ."""
    result = pytesseract.image_to_data(
        image,
        lang=ocr_languages(),
        config="--psm 6",
        output_type=pytesseract.Output.DICT,
    )
    lines = {}
    confidences = []
    for index, word in enumerate(result.get("text", [])):
        word = str(word or "").strip()
        if not word:
            continue
        key = (
            result["block_num"][index],
            result["par_num"][index],
            result["line_num"][index],
        )
        line = lines.setdefault(key, {"left": result["left"][index], "words": []})
        line["words"].append(word)
        try:
            confidence = float(result["conf"][index])
            if confidence >= 0:
                confidences.append(confidence)
        except (TypeError, ValueError):
            pass

    rendered = []
    width = max(image.width, 1)
    for line in lines.values():
        # Giữ một phần thông tin cột để Agent nhận diện đúng NET/GROSS.
        indent = " " * min(100, max(0, int(line["left"] / width * 100)))
        rendered.append(indent + " ".join(line["words"]))
    return "\n".join(rendered), statistics.mean(confidences) if confidences else 0


def pdf_page_text_a4(page):
    """Dựng lại text PDF theo tọa độ thay vì làm phẳng toàn bộ bảng."""
    page_width = max(float(page.rect.width), 1)
    words = page.get_text("words", sort=True)
    rows = []
    for word in words:
        if len(word) < 5 or not str(word[4]).strip():
            continue
        x0, y0, value = float(word[0]), float(word[1]), str(word[4]).strip()
        row = next((item for item in rows if abs(item["y"] - y0) <= 3), None)
        if row is None:
            row = {"y": y0, "words": []}
            rows.append(row)
        row["words"].append((x0, value))
    if not rows:
        return ""
    rows.sort(key=lambda row: row["y"])
    rendered = []
    previous_y = None
    for row in rows:
        if previous_y is not None:
            rendered.extend([""] * min(5, max(0, round((row["y"] - previous_y) / 12) - 1)))
        line = [" "] * 120
        cursor = 0
        for x0, value in sorted(row["words"], key=lambda item: item[0]):
            position = min(110, max(0, round(x0 / page_width * 110)))
            if position <= cursor:
                position = cursor + 1
            for char in value:
                while position >= len(line):
                    line.append(" ")
                line[position] = char
                position += 1
            cursor = position
        rendered.append("".join(line).rstrip())
        previous_y = row["y"]
    return "\n".join(rendered).strip()


def ocr_file(path):
    texts, confidences, used_ocr = [], [], False
    with pymupdf.open(path) as pdf:
        for page in pdf:
            text = pdf_page_text_a4(page)
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
            image = Image.open(BytesIO(pixmap.tobytes("png"))).convert("RGB")
            page_text, page_confidence = ocr_image(prepare_image(image))
            texts.append(page_text); confidences.append(page_confidence)
    text = "\n\n--- TRANG/ẢNH TIẾP THEO ---\n\n".join(texts).strip()
    if not text: raise ValueError("Không đọc được nội dung từ file")
    return text, statistics.mean(confidences) if confidences else 0, used_ocr


def parse_json(content, fields):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(content).strip(), flags=re.I)
    start = text.find("{")
    if start < 0:
        raise ValueError("AI không trả về JSON hợp lệ")
    try:
        data = json.JSONDecoder().raw_decode(text[start:])[0]
    except json.JSONDecodeError as error:
        raise ValueError("AI không trả về JSON hợp lệ") from error
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
    layout_rules = """Nguyên tắc bắt buộc: OCR có thể đảo thứ tự dòng/cột, tách nhãn và giá trị thành nhiều dòng. Hãy dùng toàn bộ bố cục, căn chỉnh và quan hệ ô/cột của chứng từ; không chọn chỉ vì giá trị đứng trước/sau nhãn hoặc có định dạng giống nhau. Nếu không chứng minh được đúng nhãn/ngữ cảnh thì để trống."""
    if kind == "PI":
        supplier_countries = ", ".join(
            f'{item["name"]} → {item["country"]}'
            for item in SUPPLIER_NAMES
            if item.get("country")
        )
        layout_rules += f""" Với PI, thông thường XUẤT XỨ là quốc gia của nhà cung cấp phát hành/sản xuất PI, không phải quốc gia nguồn gốc của nguyên liệu hoặc thịt. Nếu nhà cung cấp khớp danh sách chuẩn thì dùng quốc gia tương ứng: {supplier_countries}. NGOẠI LỆ BẮT BUỘC: Vetracom là đơn vị trung gian, không dùng quốc gia của Vetracom; khi nhà cung cấp là Vetracom, phải lấy XUẤT XỨ hàng hóa được ghi rõ trong chính file PI. Nếu file ghi thịt có nguồn gốc Russia thì trả Russia. Nếu không thấy rõ xuất xứ trong file thì để trống."""
    if kind == "PKL":
        layout_rules += """ Với PKL, tuyệt đối không đổi chỗ hai trọng lượng theo độ lớn: NET WEIGHT/PESO NETO là Trọng lượng, GROSS WEIGHT/PESO BRUTO là Trọng lượng cả bì. Số hộp chỉ lấy tổng CAJAS/BOXES, không lấy dòng chi tiết, pallet hoặc TARE."""
    return f"""{instruction}
Loại chứng từ: {kind}. Trả về JSON hợp lệ, không markdown, đúng các key {fields}, _confidence, _reason.
Chỉ lấy giá trị có trong OCR; không đoán, không tính, không sửa mã. Nếu không chắc chắn trả chuỗi rỗng. Giữ số 0 đầu và ký tự. Chỉ đổi ngày sang DD/MM/YYYY.
Quy tắc: {RULES[kind]}
{layout_rules}
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
        verified = parse_json(ask(prompt(kind, text, "Bạn là Agent 2, đọc độc lập toàn bộ OCR rồi kiểm tra kết quả Agent 1. Chỉ giữ giá trị có bằng chứng rõ từ đúng nhãn, ô hoặc cột; nếu hai ứng viên chưa xác định được vai trò thì để trống.", json.dumps(extracted, ensure_ascii=False)), models["verify"]), FIELDS[kind])
        carrier_names = [carrier["name"] for carrier in CARRIER_NAMES]
        supplier_names = [supplier["name"] for supplier in SUPPLIER_NAMES]
        supplier_countries = [
            {"name": supplier["name"], "country": supplier["country"]}
            for supplier in SUPPLIER_NAMES
            if supplier.get("country")
        ]
        compare_instruction = f"""Bạn là Agent 3, kiểm tra toàn bộ OCR và kết quả Agent 1/Agent 2 rồi trả về kết quả cuối.
Chỉ chọn giá trị có bằng chứng trong OCR và đã xuất hiện ở Agent 1 hoặc Agent 2; không phát minh dữ liệu mới.
Với PKL: Số hộp chỉ lấy tổng CAJAS/BOXES; Trọng lượng chỉ lấy NET WEIGHT/PESO NETO; Trọng lượng cả bì chỉ lấy GROSS WEIGHT/PESO BRUTO. Không được đổi chỗ NET và GROSS dù số nào lớn hơn, không tính toán và không lấy pallet/TARE.
Sau khi chọn đúng giá trị, hãy chuẩn hóa ngay trong kết quả cuối:
- Hãng tàu phải dùng đúng name chuẩn trong danh sách này: {json.dumps(carrier_names, ensure_ascii=False)}. Nếu Agent 1/2 có tên đầy đủ hoặc biến thể alias của cùng hãng, chọn đúng name tương ứng; không chọn tên tàu/voyage thay cho hãng tàu.
- Nhà cung cấp nếu khớp một nhà cung cấp trong danh sách chuẩn này thì trả đúng name: {json.dumps(supplier_names, ensure_ascii=False)}. Cụ thể 'Escorxador frigorific Rexach SL' phải ghi ngắn là 'Rexach'. Nếu không khớp danh sách, giữ tên nhà cung cấp có bằng chứng rõ trong OCR, không tự bịa tên viết tắt.
- Với PI, thông thường XUẤT XỨ là quốc gia của nhà cung cấp. Nếu nhà cung cấp khớp danh sách sau thì dùng đúng quốc gia tương ứng: {json.dumps(supplier_countries, ensure_ascii=False)}. NGOẠI LỆ: Vetracom là đơn vị trung gian nên không dùng quốc gia của Vetracom; phải lấy XUẤT XỨ hàng hóa được ghi rõ trong file PI. Ví dụ nếu OCR ghi thịt heo có nguồn gốc Russia thì trả Russia. Nếu không có thông tin rõ trong file thì để trống.
- Cảng đến phải trả về tên tỉnh/thành chuẩn, không trả về tên cảng: 'Cat Lai', 'HCMC', 'Ho Chi Minh City', 'Cát Lai' hoặc cảng thuộc khu vực Hồ Chí Minh thì trả 'HCM'; 'Hai Phong' hoặc 'Hải Phòng' thì trả 'HP'. Không lấy Port of Loading làm Cảng đến và không trả về 'Cat Lai'/'Hai Phong' ở kết quả cuối.
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
