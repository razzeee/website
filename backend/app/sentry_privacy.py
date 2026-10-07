import json
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_SENSITIVE_KEY = re.compile(
    r"(?:authorization|cookie|token|secret|password|passwd|api[_-]?key|"
    r"private[_-]?key|session(?:[_-]?id)?|state|code[_-]?verifier|"
    r"authorization[_-]?code|signature|jwt)",
    re.IGNORECASE,
)
_SENSITIVE_QUERY_KEY = re.compile(
    r"(?:authorization|cookie|token|secret|password|passwd|api[_-]?key|"
    r"private[_-]?key|session|state|code|code[_-]?verifier|authorization[_-]?code|"
    r"signature|jwt)",
    re.IGNORECASE,
)
_BEARER_CREDENTIAL = re.compile(r"\b(Bearer|Basic)\s+[^\s,;]+", re.IGNORECASE)
_KEY_VALUE_CREDENTIAL = re.compile(
    r"(?i)(\b(?:access_token|refresh_token|id_token|token|client_secret|"
    r"api[_-]?key|password|code|code_verifier|authorization_code)\s*[=:]\s*)"
    r"(?:\"[^\"]*\"|'[^']*'|[^\s&,;]+)"
)
_URL = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)


def _is_sensitive_key(key: str) -> bool:
    return _SENSITIVE_KEY.search(key) is not None


def _scrub_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        query = [
            (key, "[Filtered]" if _SENSITIVE_QUERY_KEY.search(key) else item)
            for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        ]
        return urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), "")
        )
    except ValueError:
        return _scrub_text(value)


def _scrub_text(value: str) -> str:
    value = _BEARER_CREDENTIAL.sub(r"\1 [Filtered]", value)
    value = _KEY_VALUE_CREDENTIAL.sub(r"\1[Filtered]", value)
    return _URL.sub(lambda match: _scrub_url(match.group(0)), value)


def scrub_sentry_value(value, key: str | None = None):
    """Redact credential-like fields and URL values without dropping event context."""
    if key is not None and _is_sensitive_key(key):
        return "[Filtered]"
    if isinstance(value, dict):
        for item_key, item in value.items():
            value[item_key] = scrub_sentry_value(item, str(item_key))
        return value
    if isinstance(value, list):
        for index, item in enumerate(value):
            value[index] = scrub_sentry_value(item)
        return value
    if isinstance(value, tuple):
        return tuple(scrub_sentry_value(item) for item in value)
    if not isinstance(value, str):
        return value

    if key is not None and key.lower().endswith("url"):
        return _scrub_url(value)

    stripped = value.lstrip()
    if stripped.startswith(("{", "[")):
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            pass
        else:
            return json.dumps(scrub_sentry_value(parsed), separators=(",", ":"))

    return _scrub_text(value)
