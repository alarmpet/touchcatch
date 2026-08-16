"""
sync_catalog_changes.py — v3 (Schema Compliant)
Synchronizes catalog.v1.json and geometry/*.json with auto-detected pixel clusters while respecting catalog.schema.json.
"""

import json
import argparse
from pathlib import Path

def get_project_root():
    current = Path(__file__).resolve().parent
    for parent in [current] + list(current.parents):
        if (parent / "package.json").exists() or (parent / "research.md").exists():
            return parent
    return Path(r"d:\touchcatch")

def sync_catalog(catalog, prompts_data, pack_filter=None, dry_run=True):
    root = get_project_root()
    prom_map = {p["packId"]: p for p in prompts_data}

    updated_count = 0
    skipped_count = 0
    issue_count = 0

    print("=" * 80)
    print(f"📋 CATALOG & GEOMETRY AUTO-SYNC v3 (Schema Compliant)")
    print(f"   Mode: {'🟡 DRY-RUN (preview only)' if dry_run else '🟢 APPLY CHANGES'}")
    print("=" * 80)

    for entry in catalog["entries"]:
        key = entry["key"]
        if pack_filter and key not in pack_filter:
            continue

        prom = prom_map.get(key)
        if not prom:
            skipped_count += 1
            continue

        prom_changes = prom.get("changes", [])
        if len(prom_changes) != 10:
            issue_count += 1
            continue

        new_changes_en = [c["text"] for c in prom_changes]

        print(f"\n  📦 [{key}] — {entry.get('canonicalAnswer', '')}")
        print(f"     Changes linked ({len(new_changes_en)}): {new_changes_en[0][:60]}...")

        if not dry_run:
            entry["changes"] = new_changes_en
            # Keep promptProvenance null-compliant per catalog.schema.json
            entry["promptProvenance"] = {
                "provider": "OPENAI",
                "model": "IMAGEGEN",
                "basePromptSha256": None,
                "editPromptSha256": None,
                "generatedAt": None,
            }

        updated_count += 1

    print(f"\n{'=' * 80}")
    print(f"📊 SYNC SUMMARY")
    print(f"{'=' * 80}")
    print(f"  ✅ Synced:   {updated_count} packs")
    print(f"  ⏭️  Skipped:  {skipped_count} packs")
    print(f"  ❌ Issues:   {issue_count} packs")

    return updated_count

def main():
    parser = argparse.ArgumentParser(description="Sync catalog and geometry with SSOT")
    parser.add_argument("--apply", action="store_true", help="Apply changes")
    parser.add_argument("--packs", nargs="*", help="Specific pack IDs")
    args = parser.parse_args()

    root = get_project_root()
    catalog_path = root / "content" / "learning" / "catalog.v1.json"
    prompts_data_path = root / "content" / "learning" / "prompts_100_guide" / "prompts_data.json"

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    with open(prompts_data_path, "r", encoding="utf-8") as f:
        prompts_data = json.load(f)

    pack_filter = set(args.packs) if args.packs else None
    updated = sync_catalog(catalog, prompts_data, pack_filter=pack_filter, dry_run=not args.apply)

    if args.apply and updated > 0:
        backup_path = catalog_path.with_suffix(".v1.backup.json")
        with open(catalog_path, "r", encoding="utf-8") as f:
            original = f.read()
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(original)
        with open(catalog_path, "w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=2, ensure_ascii=False)
        print(f"\n  💾 Catalog saved to {catalog_path.relative_to(root)}")

if __name__ == "__main__":
    main()
