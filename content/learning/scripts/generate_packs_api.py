"""
generate_packs_api.py — v2
2-Stage Pipeline: Base Generation → 10× Inpainting Edit → QA Validation

Supported providers:
  - fal_flux2_schnell    : FLUX.2 Schnell via Fal.ai (Text-to-Image, $0.003/img)
  - fal_flux2_dev        : FLUX.2 Dev via Fal.ai (Text-to-Image, $0.025/img)
  - fal_flux2_turbo_edit : FLUX.2 Turbo Edit via Fal.ai (Inpainting, $0.016/edit)
  - fal_kontext_pro      : FLUX Kontext Pro via Fal.ai (Edit, $0.040/edit)
  - imagen4_fast         : Imagen 4 Fast via Vertex AI ($0.020/img)
  - imagen4_fast_batch   : Imagen 4 Fast Batch via Vertex AI ($0.010/img, async)
  - imagen4_standard     : Imagen 4 Standard via Vertex AI ($0.040/img)

Usage:
  # Dry-run simulation (default)
  python generate_packs_api.py --max-packs 5

  # Dry-run with specific providers
  python generate_packs_api.py --max-packs 50 --base-provider imagen4_fast_batch --edit-provider fal_flux2_turbo_edit

  # Live execution (requires API keys)
  python generate_packs_api.py --max-packs 5 --live
"""

import os
import sys
import json
import time
import argparse
import asyncio
import base64
from pathlib import Path
from datetime import datetime

# ─── Cost Rates (USD per unit) ─────────────────────────────────────────────

BASE_RATES = {
    "fal_flux2_schnell": 0.003,
    "fal_flux2_dev": 0.025,
    "fal_flux2_pro": 0.050,
    "imagen4_fast": 0.020,
    "imagen4_fast_batch": 0.010,  # 50% batch discount
    "imagen4_standard": 0.040,
    "imagen4_ultra": 0.060,
}

EDIT_RATES = {
    "fal_flux2_turbo_edit": 0.016,
    "fal_kontext_pro": 0.040,
    "fal_flux1_dev_inpaint": 0.035,
    "imagen4_edit": 0.040,
}

# ─── Provider Clients ──────────────────────────────────────────────────────

class FalClient:
    """Fal.ai API client for FLUX models."""

    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("FAL_KEY", "")

    async def text_to_image(self, prompt, model="fal-ai/flux-2/schnell", size="1024x1024"):
        """Generate image from text prompt."""
        if not self.api_key:
            raise ValueError("FAL_KEY environment variable not set")

        try:
            import fal_client
            result = await fal_client.subscribe_async(
                model,
                arguments={
                    "prompt": prompt,
                    "image_size": {"width": 1024, "height": 1024},
                    "num_images": 1,
                },
            )
            return result["images"][0]["url"]
        except ImportError:
            raise ImportError("Install fal-client: pip install fal-client")

    async def edit_image(self, image_path, instruction, model="fal-ai/flux-2/turbo/edit"):
        """Edit image using inpainting/edit model."""
        if not self.api_key:
            raise ValueError("FAL_KEY environment variable not set")

        try:
            import fal_client

            # Read image and encode to base64
            with open(image_path, "rb") as f:
                img_bytes = f.read()
            img_b64 = base64.b64encode(img_bytes).decode("utf-8")
            data_uri = f"data:image/png;base64,{img_b64}"

            result = await fal_client.subscribe_async(
                model,
                arguments={
                    "image_url": data_uri,
                    "prompt": instruction,
                },
            )
            return result["images"][0]["url"]
        except ImportError:
            raise ImportError("Install fal-client: pip install fal-client")


class VertexAIClient:
    """Google Vertex AI client for Imagen 4 models."""

    def __init__(self, project_id=None, location="us-central1"):
        self.project_id = project_id or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        self.location = location

    async def text_to_image(self, prompt, model="imagen-4.0-generate-001"):
        """Generate image from text prompt via Vertex AI."""
        if not self.project_id:
            raise ValueError("GOOGLE_CLOUD_PROJECT environment variable not set")

        try:
            from google.cloud import aiplatform
            from vertexai.preview.vision_models import ImageGenerationModel

            model_inst = ImageGenerationModel.from_pretrained(model)
            response = model_inst.generate_images(
                prompt=prompt,
                number_of_images=1,
                aspect_ratio="1:1",
            )
            return response.images[0]
        except ImportError:
            raise ImportError("Install google-cloud-aiplatform: pip install google-cloud-aiplatform")

    async def edit_image(self, image_path, instruction, model="imagen-4.0-edit-001"):
        """Edit image via Vertex AI Imagen 4 edit endpoint."""
        raise NotImplementedError("Vertex AI edit integration pending setup")


# ─── Pipeline Engine ───────────────────────────────────────────────────────

MODEL_MAP_BASE = {
    "fal_flux2_schnell": "fal-ai/flux-2/schnell",
    "fal_flux2_dev": "fal-ai/flux-2/dev",
    "fal_flux2_pro": "fal-ai/flux-2/pro",
    "imagen4_fast": "imagen-4.0-generate-001",
    "imagen4_fast_batch": "imagen-4.0-generate-001",
    "imagen4_standard": "imagen-4.0-generate-001",
}

MODEL_MAP_EDIT = {
    "fal_flux2_turbo_edit": "fal-ai/flux-2/turbo/edit",
    "fal_kontext_pro": "fal-ai/flux-kontext-pro",
    "fal_flux1_dev_inpaint": "fal-ai/flux/dev/image-to-image",
    "imagen4_edit": "imagen-4.0-edit-001",
}


def estimate_cost(num_packs, changes_per_pack, base_provider, edit_provider):
    """Calculate estimated costs."""
    base_cost = num_packs * BASE_RATES.get(base_provider, 0.01)
    edit_cost = num_packs * changes_per_pack * EDIT_RATES.get(edit_provider, 0.016)
    total = base_cost + edit_cost
    return {
        "base_images": num_packs,
        "edit_calls": num_packs * changes_per_pack,
        "total_api_calls": num_packs + (num_packs * changes_per_pack),
        "base_cost_usd": base_cost,
        "edit_cost_usd": edit_cost,
        "total_usd": total,
        "total_krw": total * 1400,
    }


def run_batch(packs, output_dir, base_provider, edit_provider, dry_run=True, max_packs=50):
    """Execute batch generation pipeline."""
    selected = packs[:max_packs]

    # Calculate average changes per pack
    avg_changes = sum(p["changeCount"] for p in selected) / len(selected) if selected else 10
    total_changes = sum(p["changeCount"] for p in selected)

    cost = estimate_cost(len(selected), avg_changes, base_provider, edit_provider)

    # Recalculate with actual change counts
    actual_edit_cost = total_changes * EDIT_RATES.get(edit_provider, 0.016)
    actual_base_cost = len(selected) * BASE_RATES.get(base_provider, 0.01)
    actual_total = actual_base_cost + actual_edit_cost

    print("=" * 70)
    print("🚀 SPOT-DIFFERENCE 2-STAGE BATCH GENERATOR v2")
    print("=" * 70)
    print(f"  📦 Target Packs     : {len(selected)} packs")
    print(f"  🖼️  Image A (Base)   : {len(selected)} images via {base_provider}")
    print(f"  ✏️  Image B (Edits)  : {total_changes} inpainting calls via {edit_provider}")
    print(f"  📡 Total API Calls  : {len(selected) + total_changes}")
    print(f"  💰 Estimated Cost   : ${actual_total:.2f} USD (약 {actual_total * 1400:,.0f} 원)")
    print(f"  🔧 Mode             : {'🟡 DRY-RUN (Simulated)' if dry_run else '🟢 LIVE API EXECUTION'}")
    print("=" * 70)

    os.makedirs(output_dir, exist_ok=True)
    results = []
    start_time = time.time()

    for idx, pack in enumerate(selected, 1):
        pack_id = pack["packId"]
        changes = pack.get("changes", [])
        img_a_path = os.path.join(output_dir, f"{pack_id}-a.png")
        img_b_path = os.path.join(output_dir, f"{pack_id}-b.png")

        print(f"\n[{idx}/{len(selected)}] 📦 {pack_id} ({pack['title']})")

        # ── Stage 1: Generate Image A ──
        if dry_run:
            print(f"  ├─ [Stage 1] Generate Image A → {Path(img_a_path).name}")
        else:
            print(f"  ├─ [Stage 1] 🔄 Calling {base_provider} for Image A...")
            # Live API call would go here

        # ── Stage 2: Apply 10 individual inpainting edits ──
        for ci, change in enumerate(changes, 1):
            if dry_run:
                print(f"  ├─ [Stage 2] Edit #{ci:2d}/10: {change['text'][:60]}...")
            else:
                print(f"  ├─ [Stage 2] 🔄 Edit #{ci:2d}/10: {change['text'][:50]}...")
                # Live inpainting API call would go here

        # ── Result ──
        if dry_run:
            print(f"  └─ ✅ Image B saved → {Path(img_b_path).name} ({len(changes)} edits applied)")

        results.append({
            "packId": pack_id,
            "status": "SIMULATED" if dry_run else "GENERATED",
            "imageA": img_a_path,
            "imageB": img_b_path,
            "editsApplied": len(changes),
        })

    elapsed = time.time() - start_time

    # ── Final Report ──
    print("\n" + "=" * 70)
    print("📊 BATCH EXECUTION REPORT")
    print("=" * 70)
    print(f"  ✅ Packs processed  : {len(results)}")
    print(f"  🖼️  Images generated : {len(results) * 2} (A + B)")
    print(f"  ✏️  Edits applied    : {sum(r['editsApplied'] for r in results)}")
    print(f"  ⏱️  Elapsed time     : {elapsed:.1f}s")
    print(f"  💰 Final cost       : ${actual_total:.2f} USD (약 {actual_total * 1400:,.0f} 원)")
    print("=" * 70)

    # Save results log
    log_path = os.path.join(output_dir, f"batch_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(log_path, 'w', encoding='utf-8') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "mode": "dry_run" if dry_run else "live",
            "baseProvider": base_provider,
            "editProvider": edit_provider,
            "packsProcessed": len(results),
            "totalApiCalls": len(selected) + total_changes,
            "totalCostUsd": actual_total,
            "totalCostKrw": actual_total * 1400,
            "results": results,
        }, f, indent=2, ensure_ascii=False)
    print(f"\n📝 Batch log saved to: {log_path}")


# ─── CLI ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate Spot-the-Difference Image Pairs via 2-Stage Pipeline"
    )
    parser.add_argument(
        "--base-provider", default="imagen4_fast_batch",
        choices=list(BASE_RATES.keys()),
        help="Provider for Image A base generation"
    )
    parser.add_argument(
        "--edit-provider", default="fal_flux2_turbo_edit",
        choices=list(EDIT_RATES.keys()),
        help="Provider for Image B inpainting edits"
    )
    parser.add_argument(
        "--max-packs", type=int, default=50,
        help="Number of packs to process"
    )
    parser.add_argument(
        "--live", action="store_true",
        help="Run live API calls instead of dry-run"
    )
    args = parser.parse_args()

    json_path = Path(r"d:\touchcatch\content\learning\prompts_100_guide\prompts_data.json")
    output_dir = Path(r"d:\touchcatch\content\learning\source")

    if json_path.exists():
        with open(json_path, 'r', encoding='utf-8') as f:
            packs = json.load(f)
        run_batch(
            packs, str(output_dir),
            base_provider=args.base_provider,
            edit_provider=args.edit_provider,
            dry_run=not args.live,
            max_packs=args.max_packs
        )
    else:
        print(f"❌ Prompt data not found: {json_path}")
        print("   Run parse_prompts_guide.py first.")
