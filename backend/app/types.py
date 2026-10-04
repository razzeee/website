from collections.abc import Mapping, Sequence
from enum import StrEnum
from typing import Literal, TypedDict, TypeGuard

type JSONValue = (
    None | bool | int | float | str | Sequence[JSONValue] | Mapping[str, JSONValue]
)


def is_json_value(value: object) -> TypeGuard[JSONValue]:
    if value is None or isinstance(value, (bool, int, float, str)):
        return True
    if isinstance(value, (bytes, bytearray, memoryview)):
        return False
    if isinstance(value, Mapping):
        return all(
            isinstance(key, str) and is_json_value(item) for key, item in value.items()
        )
    if isinstance(value, Sequence):
        return all(is_json_value(item) for item in value)
    return False


def is_json_object(value: object) -> TypeGuard[dict[str, JSONValue]]:
    return isinstance(value, dict) and all(
        isinstance(key, str) and is_json_value(item) for key, item in value.items()
    )


ContentRatingLevel = Literal["none", "mild", "moderate", "intense", "unknown"]


class ContentRatingCategory(TypedDict):
    id: str
    level: ContentRatingLevel
    description: str | None


class ContentRatingResult(TypedDict, total=False):
    categories: list[ContentRatingCategory]
    contentRatingSystem: str
    minimumAge: int
    minimumAgeText: str


class ModerationRequestType(StrEnum):
    APPDATA = "appdata"
