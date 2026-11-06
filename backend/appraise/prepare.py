"""Build-time verification and encoder prefetch, in Appraise's locked environment."""

import hashlib
import json
import os
import re
from pathlib import Path

from flathub_icon_review.artifacts import load_model
from flathub_icon_review.features import Extractor

root = Path("/opt/appraise")
revision = os.environ["ENCODER_REVISION"]
bundle = os.environ["MODEL_BUNDLE_SHA256"]
if not re.fullmatch(r"[0-9a-f]{40}", revision) or not re.fullmatch(
    r"[0-9a-f]{64}", bundle
):
    raise ValueError("Explicit encoder commit and bundle SHA256 required")
icon = root / "artifacts/calibrated-clip/model.joblib"
listing = root / "artifacts/listing/model.joblib"
artifact = load_model(icon, "icon")
load_model(listing, "listing")
if artifact["features"].get("revision") != revision:
    raise ValueError("Encoder revision must match the model bundle")
Extractor("clip", revision=revision)
(root / "deployment.json").write_text(
    json.dumps(
        {
            "identity": {
                "appraise": "0.2.2",
                "bundle": bundle,
                "encoder": revision,
                "input_schema": "1",
                "adapter_schema": "1",
            },
            "files": {
                str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in (icon, listing)
            },
        }
    )
)
