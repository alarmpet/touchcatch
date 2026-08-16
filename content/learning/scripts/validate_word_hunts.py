"""
validate_word_hunts.py
Validates that wordHunt objects and suddenDeath targets in catalog.v1.json
are likely to appear in the Image A scene based on the Image A prompt text.

Usage:
  python validate_word_hunts.py
  python validate_word_hunts.py --packs en-resilience en-dilemma
"""

import json
import argparse
from pathlib import Path

CATALOG_PATH = Path(r"d:\touchcatch\content\learning\catalog.v1.json")
PROMPTS_DATA_PATH = Path(r"d:\touchcatch\content\learning\prompts_100_guide\prompts_data.json")


def check_object_in_prompt(obj_name, prompt_text):
    """Check if an object name (or synonyms) appears in the Image A prompt."""
    prompt_lower = prompt_text.lower()
    obj_lower = obj_name.lower()

    # Direct match
    if obj_lower in prompt_lower:
        return True

    # Common synonym/partial matches
    synonyms = {
        "broom": ["broom", "sweep"],
        "garden gloves": ["gloves", "garden glove"],
        "flowerpot": ["flowerpot", "flower pot", "potted plant", "potted flower"],
        "rainbow": ["rainbow"],
        "clock": ["clock", "clock tower"],
        "flag": ["flag"],
        "tree": ["tree"],
        "bench": ["bench"],
        "dog": ["dog", "retriever", "puppy"],
        "cat": ["cat", "kitten"],
        "bird": ["bird", "parrot", "seagull", "heron", "canary", "osprey"],
        "butterfly": ["butterfly", "butterflies"],
        "flower": ["flower", "flowers", "blossom"],
        "book": ["book", "books", "notebook"],
        "lamp": ["lamp", "lantern", "lamp post"],
        "umbrella": ["umbrella"],
        "hat": ["hat", "straw hat", "sun hat"],
        "brush": ["brush", "paintbrush"],
        "telescope": ["telescope"],
        "compass": ["compass"],
        "globe": ["globe"],
        "microscope": ["microscope"],
        "beaker": ["beaker", "test tube", "flask"],
        "palette": ["palette"],
        "easel": ["easel"],
        "violin": ["violin"],
        "guitar": ["guitar"],
        "piano": ["piano"],
        "drum": ["drum"],
        "trophy": ["trophy"],
        "medal": ["medal"],
        "crown": ["crown"],
        "key": ["key"],
        "map": ["map"],
        "boat": ["boat", "rowboat", "canoe"],
        "anchor": ["anchor"],
        "balloon": ["balloon"],
        "kite": ["kite"],
    }

    obj_words = obj_lower.split()
    for word in obj_words:
        if word in prompt_lower:
            return True

    # Check synonym list
    for base, syns in synonyms.items():
        if obj_lower == base or any(s in obj_lower for s in syns):
            if any(s in prompt_lower for s in syns):
                return True

    return False


def validate_word_hunts(catalog, prompts_data, pack_filter=None):
    """Validate wordHunts and suddenDeath objects against Image A prompts."""
    prom_map = {p["packId"]: p for p in prompts_data}

    total_objects = 0
    found_objects = 0
    missing_objects = []

    print("=" * 90)
    print("🔍 WORD HUNT & SUDDEN DEATH OBJECT VALIDATION")
    print("=" * 90)

    for entry in catalog["entries"]:
        key = entry["key"]
        if pack_filter and key not in pack_filter:
            continue

        prom = prom_map.get(key, {})
        img_a_prompt = prom.get("imageAPrompt", "")

        word_hunts = entry.get("wordHunts", [])
        sudden_death = entry.get("suddenDeath", {})

        pack_issues = []

        # Check wordHunt objects
        for wh in word_hunts:
            obj = wh.get("object", "")
            kind = wh.get("kind", "NORMAL")
            total_objects += 1

            if check_object_in_prompt(obj, img_a_prompt):
                found_objects += 1
            else:
                pack_issues.append(f"  WordHunt ({kind}): '{obj}' — NOT FOUND in Image A prompt")
                missing_objects.append({
                    "packId": key,
                    "type": f"wordHunt-{kind}",
                    "object": obj,
                })

        # Check suddenDeath object
        if sudden_death:
            sd_obj = sudden_death.get("object", "")
            total_objects += 1
            if check_object_in_prompt(sd_obj, img_a_prompt):
                found_objects += 1
            else:
                pack_issues.append(f"  SuddenDeath: '{sd_obj}' — NOT FOUND in Image A prompt")
                missing_objects.append({
                    "packId": key,
                    "type": "suddenDeath",
                    "object": sd_obj,
                })

        # Print results
        if pack_issues:
            print(f"\n⚠️  [{key}] — {entry.get('canonicalAnswer', '')}")
            for issue in pack_issues:
                print(f"    {issue}")
        else:
            if word_hunts or sudden_death:
                wh_count = len(word_hunts)
                sd_count = 1 if sudden_death else 0
                # Silent pass — only show summary

    # Summary
    print(f"\n{'=' * 90}")
    print(f"📊 VALIDATION SUMMARY")
    print(f"{'=' * 90}")
    print(f"  Total objects checked:  {total_objects}")
    print(f"  ✅ Found in prompt:     {found_objects}")
    print(f"  ⚠️  Missing from prompt: {len(missing_objects)}")
    print(f"  Match rate:            {found_objects/total_objects*100:.1f}%" if total_objects > 0 else "  No objects to check")

    if missing_objects:
        print(f"\n{'=' * 90}")
        print(f"⚠️  MISSING OBJECTS — Consider adding to Image A prompt:")
        print(f"{'=' * 90}")

        # Group by pack
        by_pack = {}
        for m in missing_objects:
            by_pack.setdefault(m["packId"], []).append(m)

        for pack_id, items in sorted(by_pack.items()):
            objs = ", ".join(f"'{i['object']}' ({i['type']})" for i in items)
            print(f"  {pack_id}: {objs}")

    return missing_objects


def main():
    parser = argparse.ArgumentParser(description="Validate wordHunt/suddenDeath objects in catalog")
    parser.add_argument("--packs", nargs="*", help="Specific pack IDs to check")
    args = parser.parse_args()

    if not CATALOG_PATH.exists():
        print(f"❌ Catalog not found: {CATALOG_PATH}")
        return
    if not PROMPTS_DATA_PATH.exists():
        print(f"❌ Prompts data not found: {PROMPTS_DATA_PATH}")
        return

    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    with open(PROMPTS_DATA_PATH, "r", encoding="utf-8") as f:
        prompts_data = json.load(f)

    pack_filter = set(args.packs) if args.packs else None
    validate_word_hunts(catalog, prompts_data, pack_filter=pack_filter)


if __name__ == "__main__":
    main()
