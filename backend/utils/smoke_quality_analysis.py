"""Run inside the dedicated image, with its network disabled, before pilot enablement.

python -m utils.smoke_quality_analysis listing.json --icon icon.png

Use --network=none --read-only --tmpfs /tmp:rw,size=64m --cpus=2 --memory=4g
and mount the listing/icon read-only. Expect 12 scored criteria for a complete
listing and icon, or 6 without an icon (--expect-scored). Measure cold/warm runs
on deployment hardware before enabling the feature; fixture tests do not verify
real-model performance or usefulness.
"""

import argparse
import hashlib
import json
import resource
import time
from pathlib import Path

from app.quality_analysis import LEARNED_CRITERIA, identity, invoke_cli


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("listing", type=Path)
    parser.add_argument("--icon", type=Path)
    parser.add_argument("--expect-scored", type=int, choices=range(13))
    args = parser.parse_args()
    started = time.monotonic()
    result = invoke_cli(
        json.loads(args.listing.read_text()),
        args.icon.read_bytes() if args.icon else None,
    )
    scored = sum(
        result["criteria"][key].get("pass_score") is not None
        for key in LEARNED_CRITERIA
    )
    if args.expect_scored is not None and scored != args.expect_scored:
        raise SystemExit(
            f"Expected {args.expect_scored} learned scores, received {scored}"
        )
    print(
        json.dumps(
            {
                "seconds": time.monotonic() - started,
                "max_rss_kib": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                "identity": identity(),
                "listing_sha256": hashlib.sha256(args.listing.read_bytes()).hexdigest(),
                "icon_sha256": hashlib.sha256(args.icon.read_bytes()).hexdigest()
                if args.icon
                else None,
                "scored_criteria": scored,
                "criteria": result["criteria"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
