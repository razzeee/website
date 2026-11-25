from app.year_in_review_favorites import favorite_charts


def test_standouts_use_percentile_gap_and_do_not_need_30_accounts():
    downloads = {str(n): 1000 - n for n in range(1000)}
    saves = [
        (app, user)
        for app, count in [("100", 4), ("5", 3), ("6", 2), ("990", 1)]
        for user in range(count)
    ]
    standouts, _ = favorite_charts(downloads, saves)
    assert standouts == [
        {
            "app_id": "100",
            "favorite_rank": 1,
            "download_rank": 101,
            "favorites_chart_size": 4,
            "downloads_chart_size": 1000,
        }
    ]


def test_equal_ordinal_ranks_can_have_different_percentiles():
    saves = [(str(n), 0) for n in range(100)] + [("0", 1)]
    standouts, _ = favorite_charts({"0": 10, "1": 1}, saves)
    assert standouts == [
        {
            "app_id": "1",
            "favorite_rank": 2,
            "download_rank": 2,
            "favorites_chart_size": 100,
            "downloads_chart_size": 2,
        }
    ]


def test_pairs_include_apps_and_accounts_without_downloads():
    saves = [(app, n) for app in ("a", "b") for n in range(30)]
    saves.append(("c", 30))
    _, pairs = favorite_charts({"a": 10}, saves)
    assert pairs == [
        {"apps": [{"app_id": "a"}, {"app_id": "b"}], "shared_accounts": 30}
    ]


def test_favorite_gap_uses_tied_ranks_and_pairs_need_a_shared_audience():
    downloads = {"editor": 10, "brushes": 20, "player": 100, "other": 110, "tiny": 1}
    saves = {
        "editor": range(30),
        "brushes": range(30),
        "tiny": range(29),
        "player": range(100),
    }
    standouts, pairs = favorite_charts(
        downloads, ((app, user) for app, users in saves.items() for user in users)
    )
    assert [
        (app["app_id"], app["favorite_rank"], app["download_rank"]) for app in standouts
    ] == [
        ("editor", 2, 4),
        ("player", 1, 2),
        ("brushes", 2, 3),
    ]
    assert pairs == [
        {
            "apps": [{"app_id": "brushes"}, {"app_id": "editor"}],
            "shared_accounts": 30,
        }
    ]
