from collections import defaultdict
from collections.abc import Iterable
from itertools import combinations

MIN_SHARED_ACCOUNTS = 30


def _ranks(counts: dict[str, int]) -> dict[str, int]:
    places: dict[int, int] = {}
    for index, count in enumerate(sorted(counts.values(), reverse=True), 1):
        places.setdefault(count, index)
    return {app: places[count] for app, count in counts.items()}


def favorite_charts(downloads: dict[str, int], saves: Iterable[tuple[str, int]]):
    accounts: dict[str, set[int]] = defaultdict(set)
    for app, account in saves:
        accounts[app].add(account)

    counts = {app: len(users) for app, users in accounts.items()}
    favorite_rank = _ranks(counts)
    download_rank = _ranks(downloads)
    # Compare percent_rank() on each chart. Both denominators are constant,
    # so cross-multiplication preserves exact ties when ordering the gaps.
    gaps = {
        app: (download_rank[app] - 1) * max(1, len(counts) - 1)
        - (favorite_rank[app] - 1) * max(1, len(downloads) - 1)
        for app in counts.keys() & downloads.keys()
        if favorite_rank[app] <= 100
    }
    contenders = [app for app, gap in gaps.items() if gap > 0]
    contenders.sort(
        key=lambda app: (
            -gaps[app],
            favorite_rank[app],
            app,
        )
    )
    standouts = [
        {
            "app_id": app,
            "favorite_rank": favorite_rank[app],
            "download_rank": download_rank[app],
            "favorites_chart_size": len(counts),
            "downloads_chart_size": len(downloads),
        }
        for app in contenders[:3]
    ]

    audience = len({account for users in accounts.values() for account in users})
    pairs = []
    for a, b in combinations(
        sorted(app for app in counts if counts[app] >= MIN_SHARED_ACCOUNTS), 2
    ):
        shared = len(accounts[a] & accounts[b])
        if shared >= MIN_SHARED_ACCOUNTS:
            lift = shared * audience / (counts[a] * counts[b])
            if lift > 1:
                pairs.append((-lift, -shared, a, b))
    return standouts, [
        {"apps": [{"app_id": a}, {"app_id": b}], "shared_accounts": -negative_shared}
        for _, negative_shared, a, b in sorted(pairs)[:3]
    ]
