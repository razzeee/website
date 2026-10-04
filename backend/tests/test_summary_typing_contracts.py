import os
import sys
from unittest.mock import patch

import pytest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

with patch("meilisearch.Client"):
    from app.summary import parse_eol_data


def test_parse_eol_data_returns_typed_rebase_and_message_maps():
    metadata = {
        "xa.sparse-cache": {
            "app/org.old.App/x86_64/stable": {"eolr": "app/org.new.App/x86_64/stable"},
            "app/org.retired.App/aarch64/42": {"eol": "No longer supported"},
        }
    }

    rebases, messages = parse_eol_data(metadata)

    assert rebases == {"org.new.App": ["org.old.App:stable"]}
    assert messages == {"org.retired.App:42": "No longer supported"}


def test_parse_eol_data_rejects_malformed_sparse_cache():
    with pytest.raises(TypeError, match="invalid xa.sparse-cache"):
        parse_eol_data({"xa.sparse-cache": ["not", "a", "mapping"]})
