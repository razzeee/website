"""Build-time verification and encoder prefetch, in Appraise's locked environment."""

import hashlib
import json
import runpy
from pathlib import Path

from flathub_icon_review.artifacts import load_model
from flathub_icon_review.features import Extractor

root = Path("/opt/appraise")
identity = runpy.run_path("/tmp/appraise-release.py")["IDENTITY"]
revision = identity["encoder"]
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
            "identity": identity,
            "files": {
                str(path): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in (icon, listing)
            },
        }
    )
)
