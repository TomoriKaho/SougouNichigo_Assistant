#!/Users/tomorikaho/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image


ROOT = Path("/Users/tomorikaho/Documents/Academy/日语")
PDF_PATH = ROOT / "单词.pdf"
OUTPUT_PATH = ROOT / "综合日语-第四册-单词.json"
OCR_JSON_PATH = ROOT / ".tmp_vocab_ocr.json"
IMAGE_DIR = ROOT / ".tmp_vocab_images"
SWIFT_SOURCE = ROOT / "extract_vocab_ocr.swift"
SWIFT_BINARY = ROOT / ".tmp_extract_vocab_ocr"
PYTHON = Path("/Users/tomorikaho/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3")


CIRCLE_MAP = str.maketrans({
    "0": "⓪",
    "1": "①",
    "2": "②",
    "3": "③",
    "4": "④",
    "5": "⑤",
    "6": "⑥",
    "7": "⑦",
    "8": "⑧",
    "9": "⑨",
    "O": "⓪",
    "o": "⓪",
    "◎": "⓪",
})

LESSON_RE = re.compile(r"第\s*(\d+)\s*課")
PAGE_LABEL_RE = re.compile(r"^\d+-\d+$")
UNIT_RE = re.compile(r"ユニット\s*([12])")
TERM_PREFIX_RE = re.compile(r"^(新出単語|練習用単語|ユニット[12])+")


@dataclass
class OCRLine:
    text: str
    left: float
    top: float
    width: float
    height: float
    confidence: float = 0.0

    @property
    def right(self) -> float:
        return self.left + self.width

    @property
    def bottom(self) -> float:
        return self.top + self.height

    @property
    def center_y(self) -> float:
        return self.top + self.height / 2


def normalize_text(text: str) -> str:
    text = text.replace("＜", "<").replace("＞", ">")
    text = text.replace("く", "<").replace(">", ">")
    text = text.replace("〈", "<").replace("〉", ">")
    text = text.replace("♥", "▼")
    text = text.replace("/7", "/▼")
    text = text.replace("(7", "(▼")
    text = text.replace("・7", "・▼")
    text = text.replace("7綺麗", "▼綺麗")
    text = text.replace("7凄い", "▼凄い")
    text = text.replace("V塗れ", "▼塗れ")
    text = text.replace("(V", "(▼")
    text = text.replace("・V", "・▼")
    text = text.replace("口塗れ", "▼塗れ")
    text = text.replace("一まみれ", "-まみれ")
    text = text.replace("超一", "超-")
    text = text.replace("ー", "ー")
    text = text.replace(" ", "")
    text = text.replace("・.", "・")
    text = text.replace("।।", "II")
    text = text.replace("皿", "III")
    return text.strip()


def normalize_pitch(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    value = text.translate(CIRCLE_MAP)
    value = value.replace("ー", "-")
    value = value.replace("–", "-")
    value = value.replace("—", "-")
    value = value.replace(" ", "")
    value = value.replace("⓪⓪", "⓪")
    return value


def normalize_pos(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    value = normalize_text(text)
    value = value.strip("<>")
    value = value.replace("日", "自").replace("白", "自")
    value = value.replace("皿", "III")
    value = value.replace("Ⅱ", "II")
    value = value.replace("Ⅰ", "I")
    value = value.replace("IIII", "III")
    value = value.replace("自他I", "自他I")
    return value or None


def normalize_gloss(text: str) -> str:
    value = text.replace("；", "；").replace("，", "，")
    value = value.replace("冰雪芊", "冰雪节")
    value = value.replace("床祝活効", "庆祝活动")
    value = value.replace("佳銃", "传统")
    value = value.replace("（传统）日；庆祝活动", "（传统）节日；庆祝活动")
    value = value.replace("資然", "自然")
    value = value.replace("冒味", "冒昧")
    value = value.replace("副烈", "剧烈")
    value = value.replace("内処う表作", "装作")
    value = value.replace("牛正", "举止")
    value = value.replace("冰決", "冰块")
    value = value.replace("超級", "超级")
    value = value.replace("崇武；武武", "尝试；试试")
    value = value.replace("蛤尔淀", "哈尔滨")
    value = value.replace("哈爾淀", "哈尔滨")
    value = value.replace("哈尔淀", "哈尔滨")
    value = value.replace("拍；雨；高週", "鲜艳；华丽；高调")
    value = value.replace("板其", "极其")
    value = value.replace("強週", "强调")
    value = value.replace("強凋", "强调")
    value = value.replace("好得很；板其；厉害", "好得很；极其；厉害")
    value = value.replace("満（某一町同）", "满（某一时间）")
    value = value.replace("辻年", "过年")
    value = value.replace("辻（某一町同）", "过（某一时间）")
    value = value.replace("海身是雪", "浑身是雪")
    value = value.replace("感効", "感动")
    value = value.replace("沾満", "沾满")
    value = value.replace("彷效", "仿效")
    value = value.replace("挙止", "举止")
    value = re.sub(r"\s+", "", value)
    return value


def sort_lines(lines: List[OCRLine]) -> List[OCRLine]:
    return sorted(lines, key=lambda item: (item.top, item.left))


def find_separator_bands(image_path: Path, page_width: int, page_height: int) -> List[Tuple[int, int]]:
    img = Image.open(image_path).convert("L")
    left = int(page_width * 0.05)
    right = int(page_width * 0.95)
    top = int(page_height * 0.08)
    bottom = int(page_height * 0.96)
    crop = img.crop((left, top, right, bottom))
    width, height = crop.size

    dark_rows: List[int] = []
    for y in range(height):
        row = crop.crop((0, y, width, y + 1))
        dark = 0
        pixels = row.load()
        for x in range(width):
            if pixels[x, 0] < 170:
                dark += 1
        if dark / width > 0.34:
            dark_rows.append(y + top)

    bands: List[Tuple[int, int]] = []
    for y in dark_rows:
        if not bands or y > bands[-1][1] + 4:
            bands.append((y, y))
        else:
            bands[-1] = (bands[-1][0], y)
    return bands


def cluster_lines(lines: List[OCRLine], max_gap: float = 18.0) -> List[List[OCRLine]]:
    if not lines:
        return []
    ordered = sorted(lines, key=lambda item: item.top)
    groups: List[List[OCRLine]] = [[ordered[0]]]
    current_bottom = ordered[0].bottom
    for line in ordered[1:]:
        if line.top <= current_bottom + max_gap:
            groups[-1].append(line)
            current_bottom = max(current_bottom, line.bottom)
        else:
            groups.append([line])
            current_bottom = line.bottom
    return groups


def extract_page_meta(lines: List[OCRLine]) -> Dict[str, Optional[str]]:
    top_lines = [line for line in lines if line.top < 650]
    texts = [normalize_text(line.text) for line in sort_lines(top_lines)]
    lesson_number: Optional[int] = None
    lesson_name: Optional[str] = None
    unit_name: Optional[str] = None
    list_type: Optional[str] = None
    page_label: Optional[str] = None

    for text in texts:
        lesson_match = LESSON_RE.search(text)
        if lesson_match and lesson_number is None:
            lesson_number = int(lesson_match.group(1))
        if "ユニット" in text and unit_name is None:
            unit_name = text.replace(" ", "")
        if text in {"新出単語", "練習用単語"} and list_type is None:
            list_type = text
        if PAGE_LABEL_RE.match(text):
            page_label = text

    if lesson_number is not None:
        candidates = [text for text in texts if "課" in text and "第" in text and "ユニット" not in text]
        for candidate in candidates:
            match = LESSON_RE.search(candidate)
            if match:
                after = candidate[match.end():].strip("：:")
                if after:
                    lesson_name = after
                    break
    return {
        "lesson_number": lesson_number,
        "lesson_name": lesson_name,
        "unit_name": unit_name,
        "list_type": list_type,
        "page_label": page_label,
    }


def assign_columns(lines: List[OCRLine], width: int) -> Tuple[List[OCRLine], List[OCRLine], List[OCRLine]]:
    left_cut = width * 0.42
    center_cut = width * 0.58
    left_lines: List[OCRLine] = []
    center_lines: List[OCRLine] = []
    right_lines: List[OCRLine] = []
    for line in lines:
        if line.left < left_cut:
            left_lines.append(line)
        elif line.left < center_cut:
            center_lines.append(line)
        else:
            right_lines.append(line)
    return left_lines, center_lines, right_lines


def merge_text(lines: List[OCRLine]) -> str:
    ordered = sorted(lines, key=lambda item: (item.top, item.left))
    texts = [normalize_text(line.text) for line in ordered]
    return "".join(texts).strip()


def extract_pos_tags(text: str) -> Tuple[List[str], str]:
    tags = re.findall(r"<[^<>]+>", text)
    cleaned = re.sub(r"<[^<>]+>", "", text)
    return tags, cleaned.strip()


def parse_term_block(text: str) -> Tuple[str, Optional[str], Optional[str]]:
    term_text = text
    pitch = None
    pitch_match = re.search(r"([⓪①②③④⑤⑥⑦⑧⑨O0◎]+(?:-[⓪①②③④⑤⑥⑦⑧⑨O0◎]+)?)$", term_text)
    if pitch_match:
        pitch = normalize_pitch(pitch_match.group(1))
        term_text = term_text[: pitch_match.start()]
    term_text = term_text.strip()

    extra = None
    if "（" in term_text and term_text.endswith("）"):
        idx = term_text.find("（")
        extra = term_text[idx + 1 : -1]
        term = term_text[:idx]
    else:
        term = term_text
    return term, extra, pitch


def looks_like_header(text: str) -> bool:
    compact = normalize_text(text)
    return (
        "ユニット" in compact
        or compact in {"新出単語", "練習用単語"}
        or compact.startswith("第") and "課" in compact
    )


def parse_segment(lines: List[OCRLine], width: int) -> Dict[str, Any]:
    left_lines, center_lines, right_lines = assign_columns(lines, width)
    left_text = merge_text(left_lines)
    center_text = merge_text(center_lines)
    right_text = merge_text(right_lines)

    center_split = re.match(r"^(<[^>]+>)(.+)$", center_text)
    if center_split and not right_text:
        center_text = center_split.group(1)
        right_text = center_split.group(2)

    left_tags, left_text = extract_pos_tags(left_text)
    center_tags, center_text = extract_pos_tags(center_text)
    right_tags, right_text = extract_pos_tags(right_text)
    pos_tags = left_tags + center_tags + right_tags
    pos = normalize_pos(pos_tags[0]) if pos_tags else None

    if center_text and not right_text:
        right_text = center_text
        center_text = ""

    if not left_text and not center_text and not right_text:
        return {"kind": "empty"}

    if looks_like_header(left_text) and not right_text:
        return {
            "kind": "header",
            "left_text": left_text,
            "center_text": center_text,
            "right_text": right_text,
        }

    term, extra, pitch = parse_term_block(left_text)
    gloss = normalize_gloss(right_text)

    if pos is None and center_text:
        maybe_pos = normalize_pos(center_text)
        if maybe_pos and len(center_text) <= 12:
            pos = maybe_pos
            center_text = ""

    if not term and not gloss:
        return {"kind": "empty"}

    if term.startswith("ー") and extra and extra.startswith("-"):
        term = "-" + term[1:]

    return {
        "kind": "entry",
        "词条": term or left_text,
        "词条补充": extra,
        "声调": pitch,
        "词性": pos,
        "词语解释": gloss or None,
        "raw_left": left_text,
        "raw_center": center_text,
        "raw_right": right_text,
    }


def build_structure() -> Dict[str, Any]:
    if not SWIFT_BINARY.exists():
        subprocess.run(
            ["swiftc", str(SWIFT_SOURCE), "-o", str(SWIFT_BINARY)],
            check=True,
            cwd=ROOT,
        )

    if OCR_JSON_PATH.exists():
        OCR_JSON_PATH.unlink()
    if IMAGE_DIR.exists():
        for child in IMAGE_DIR.iterdir():
            child.unlink()
    else:
        IMAGE_DIR.mkdir()

    subprocess.run(
        [
            str(SWIFT_BINARY),
            str(PDF_PATH),
            "4",
            "73",
            str(IMAGE_DIR),
            str(OCR_JSON_PATH),
        ],
        check=True,
        cwd=ROOT,
    )

    payload = json.loads(OCR_JSON_PATH.read_text())
    result: Dict[str, Any] = {"教材": PDF_PATH.name, "课次": []}
    lessons: Dict[int, Dict[str, Any]] = {}

    current_lesson: Optional[Dict[str, Any]] = None
    current_unit: Optional[Dict[str, Any]] = None
    current_list: Optional[Dict[str, Any]] = None

    for page in payload["pages"]:
        page_width = page["imageWidth"]
        page_height = page["imageHeight"]
        lines = [OCRLine(**line) for line in page["lines"]]
        page_meta = extract_page_meta(lines)
        carried_list_type = current_list["词表类型"] if current_list is not None else None

        lesson_number = page_meta["lesson_number"]
        lesson_name = page_meta["lesson_name"]
        if lesson_number is not None:
            if lesson_number not in lessons:
                lesson_obj = {"课序": lesson_number, "课名": lesson_name, "单元": []}
                lessons[lesson_number] = lesson_obj
                result["课次"].append(lesson_obj)
            current_lesson = lessons[lesson_number]
            if lesson_name and not current_lesson.get("课名"):
                current_lesson["课名"] = lesson_name

        if current_lesson is None:
            raise RuntimeError(f"Unable to resolve lesson for pdf page {page['pdfPage']}")

        page_unit_name = page_meta["unit_name"]
        page_list_type = page_meta["list_type"]
        page_label = page_meta["page_label"]

        def ensure_unit(unit_name: Optional[str]) -> None:
            nonlocal current_unit
            if unit_name is None:
                return
            unit_name = unit_name.replace(" ", "")
            unit_number_match = UNIT_RE.search(unit_name)
            unit_number = int(unit_number_match.group(1)) if unit_number_match else len(current_lesson["单元"]) + 1
            for unit in current_lesson["单元"]:
                if unit["单元名"] == unit_name:
                    current_unit = unit
                    return
            unit_obj = {"单元序": unit_number, "单元名": unit_name, "词表": []}
            current_lesson["单元"].append(unit_obj)
            current_unit = unit_obj

        def ensure_list(list_type: Optional[str], pdf_page: int, page_label_value: Optional[str]) -> None:
            nonlocal current_list
            if current_unit is None or list_type is None:
                return
            for item in current_unit["词表"]:
                if item["词表类型"] == list_type and item["pdf页码"] == pdf_page:
                    current_list = item
                    return
            list_obj = {
                "词表类型": list_type,
                "pdf页码": pdf_page,
                "教材页码": page_label_value,
                "词条列表": [],
            }
            current_unit["词表"].append(list_obj)
            current_list = list_obj

        ensure_unit(page_unit_name)
        ensure_list(page_list_type, page["pdfPage"], page_label)
        if page_list_type is None and carried_list_type is not None:
            ensure_list(carried_list_type, page["pdfPage"], page_label)

        bands = find_separator_bands(Path(page["imagePath"]), page_width, page_height)
        text_lines = [line for line in lines if line.top > page_height * 0.12 and line.top < page_height * 0.96]

        segments: List[List[OCRLine]] = []
        top_limit = int(page_height * 0.12)
        previous_end = top_limit
        for start, end in bands:
            band_lines = [line for line in text_lines if line.center_y >= previous_end and line.center_y <= start]
            band_lines = [line for line in band_lines if not PAGE_LABEL_RE.match(normalize_text(line.text))]
            if band_lines:
                segments.extend(cluster_lines(band_lines))
            previous_end = end
        tail_lines = [line for line in text_lines if line.center_y >= previous_end]
        if tail_lines:
            segments.extend(cluster_lines(tail_lines))

        for segment_lines in segments:
            parsed = parse_segment(segment_lines, page_width)
            if parsed["kind"] == "empty":
                continue
            if parsed["kind"] == "header":
                compact = parsed["left_text"]
                if "ユニット" in compact:
                    ensure_unit(next((part for part in compact.split("新出単語") if "ユニット" in part), compact))
                if "新出単語" in compact:
                    ensure_list("新出単語", page["pdfPage"], page_label)
                if "練習用単語" in compact:
                    ensure_list("練習用単語", page["pdfPage"], page_label)
                continue

            if current_unit is None:
                ensure_unit(page_unit_name or "ユニット1")
            if current_list is None:
                ensure_list(page_list_type or "新出単語", page["pdfPage"], page_label)
            entry = {
                "词条": parsed["词条"],
                "词条补充": parsed["词条补充"],
                "声调": parsed["声调"],
                "词性": parsed["词性"],
                "词语解释": parsed["词语解释"],
            }
            current_list["词条列表"].append(entry)

    return result


def clean_reading(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if text.startswith("7"):
        text = "▼" + text[1:]
    if text.startswith("V"):
        text = "▼" + text[1:]
    if text.startswith("<"):
        text = "く" + text[1:]
    if text.endswith("<"):
        text = text[:-1] + "く"
    return text


def clean_entry(entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    term = (entry.get("词条") or "").strip()
    extra = clean_reading(entry.get("词条补充"))
    pitch = entry.get("声调")
    pos = entry.get("词性")
    gloss = entry.get("词语解释")

    term = TERM_PREFIX_RE.sub("", term).strip()
    term = re.sub(r"^第\d+課", "", term).strip()
    term = term.lstrip("：:")

    if term in {"新出単語", "練習用単語"}:
        return None
    if not term:
        return None
    if gloss and re.fullmatch(r"\d+(?:-\d+)?", gloss):
        return None

    return {
        "词条": term,
        "词条补充": extra,
        "声调": pitch,
        "词性": pos,
        "词语解释": gloss,
    }


def clean_structure(data: Dict[str, Any]) -> Dict[str, Any]:
    for lesson in data["课次"]:
        cleaned_units = []
        for unit in lesson["单元"]:
            cleaned_lists = []
            for word_list in unit["词表"]:
                cleaned_entries = []
                for entry in word_list["词条列表"]:
                    cleaned = clean_entry(entry)
                    if cleaned is not None:
                        cleaned_entries.append(cleaned)
                if cleaned_entries:
                    word_list["词条列表"] = cleaned_entries
                    cleaned_lists.append(word_list)
            if cleaned_lists:
                unit["词表"] = cleaned_lists
                cleaned_units.append(unit)
        lesson["单元"] = cleaned_units
    return data


def main() -> None:
    data = clean_structure(build_structure())
    OUTPUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
