import sys
import zipfile
from xml.etree import ElementTree as ET


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def iter_paragraph_lines(docx_path: str):
    z = zipfile.ZipFile(docx_path)
    xml = z.read("word/document.xml")
    root = ET.fromstring(xml)

    for para in root.findall(".//w:body/w:p", NS):
        parts: list[str] = []
        for r in para.findall(".//w:r", NS):
            rpr = r.find("w:rPr", NS)
            color = None
            if rpr is not None:
                c = rpr.find("w:color", NS)
                if c is not None:
                    color = c.attrib.get(f"{{{NS['w']}}}val")

            txt = "".join((t.text or "") for t in r.findall("w:t", NS)).replace("\u00a0", " ")
            if not txt:
                continue

            is_red = bool(color) and str(color).upper() in ("FF0000", "EE0000")
            parts.append(f"<<{txt}>>" if is_red else txt)

        line = "".join(parts).strip()
        if line:
            yield line


def main(argv: list[str]):
    if len(argv) < 2:
        print("Usage: docx_placeholders.py <path.docx>")
        return 2

    path = argv[1]
    lines = list(iter_paragraph_lines(path))
    print(f"PARAS {len(lines)}")
    for i, s in enumerate(lines[:180], 1):
        print(f"{i:03d}: {s}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

