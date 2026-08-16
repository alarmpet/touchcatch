"""
parse_prompts_guide.py — v3 (SSOT & Relative Paths)
Parses PROMPTS_100_GUIDE.md into structured JSON with relative paths.
"""

import re
import json
import os
from pathlib import Path


def get_project_root():
    """Find the root directory of the touchcatch project."""
    current = Path(__file__).resolve().parent
    for parent in [current] + list(current.parents):
        if (parent / "package.json").exists() or (parent / "research.md").exists():
            return parent
    return Path(r"d:\touchcatch")


def parse_prompts_guide(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    pack_blocks = re.split(r'\n(?=### \d+\. \[)', content)
    packs = []

    for block in pack_blocks:
        if not block.startswith('### '):
            continue

        header_match = re.search(
            r'### \d+\. \[([a-zA-Z0-9_-]+)\] - ([^(]+)\(([^)]+)\)', block
        )
        if not header_match:
            continue

        pack_id = header_match.group(1).strip()
        title = header_match.group(2).strip()
        category = header_match.group(3).strip()

        style_match = re.search(
            r'- \*\*Recommended Art Style:\*\* `([^`]+)`', block
        )
        art_style = style_match.group(1).strip() if style_match else ""

        image_a_match = re.search(
            r'#### 📌 Image A Prompt \(Base\)\s+```text\s+(.*?)\s+```',
            block, re.DOTALL
        )
        image_a_prompt = image_a_match.group(1).strip() if image_a_match else ""

        image_b_match = re.search(
            r'#### 📌 Image B Prompt \(Input after Image A reference.*?\)\s+```text\s+(.*?)\s+```',
            block, re.DOTALL
        )
        image_b_prompt = image_b_match.group(1).strip() if image_b_match else ""

        changes = []
        if image_b_prompt:
            change_matches = re.findall(r'(\d+)\.\s+([^\n]+)', image_b_prompt)
            for num, text in change_matches:
                text = text.strip()
                if text.startswith("Do NOT") or text.startswith("Maintain"):
                    continue

                changes.append({
                    "id": int(num),
                    "text": text,
                    "inpaintInstruction": (
                        f"In this image, {text[0].lower()}{text[1:]}. "
                        f"Keep everything else exactly the same."
                    )
                })

        packs.append({
            "packId": pack_id,
            "title": title,
            "category": category,
            "artStyle": art_style,
            "imageAPrompt": image_a_prompt,
            "imageBPrompt": image_b_prompt,
            "changes": changes,
            "changeCount": len(changes)
        })

    return packs


if __name__ == "__main__":
    root = get_project_root()
    guide_path = root / "content" / "learning" / "prompts_100_guide" / "PROMPTS_100_GUIDE.md"
    output_path = root / "content" / "learning" / "prompts_100_guide" / "prompts_data.json"

    if guide_path.exists():
        parsed_packs = parse_prompts_guide(guide_path)
        os.makedirs(output_path.parent, exist_ok=True)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(parsed_packs, f, indent=2, ensure_ascii=False)

        print(f"✅ Successfully parsed {len(parsed_packs)} packs into relative path: {output_path.relative_to(root)}")
    else:
        print(f"❌ File not found: {guide_path}")
