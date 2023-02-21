from typing import List
from urllib.parse import unquote

import meilisearch

from . import config, schemas

client = meilisearch.Client(
    config.settings.meilisearch_url, config.settings.meilisearch_master_key
)
client.create_index("apps")
client.index("apps").update_sortable_attributes(["installs_last_month"])
client.index("apps").update_searchable_attributes(
    ["name", "summary", "keywords", "description", "id"]
)
client.index("apps").update_filterable_attributes(
    ["categories", "developer_name", "project_group"]
)


def add_apps(app_search_items):
    client.index("apps").add_documents(app_search_items)


def update_apps(apps_to_update):
    client.index("apps").update_documents(apps_to_update)


def delete_apps(app_id_list):
    if len(app_id_list) > 0:
        client.index("apps").delete_documents(app_id_list)


def get_by_selected_categories(
    selected_categories: List[schemas.MainCategory], page: int, hits_per_page: int
):
    category_list = [
        f"categories = {category.value}" for category in selected_categories
    ]

    return client.index("apps").search(
        "",
        {
            "filter": [category_list],
            "sort": ["installs_last_month:desc"],
            "hitsPerPage": hits_per_page or 250,
            "page": page or 1,
        },
    )


def get_available_developers():
    return client.index("apps").search(
        "",
        {
            "facets": ["developer_name"],
        },
    )


def get_by_selected_developers(
    selected_developers: List[str], page: int, hits_per_page: int
):
    developer_list = [
        f"developer_name = {developer}" for developer in selected_developers
    ]

    return client.index("apps").search(
        "",
        {
            "filter": [developer_list],
            "sort": ["installs_last_month:desc"],
            "hitsPerPage": hits_per_page or 250,
            "page": page or 1,
        },
    )


def get_available_project_groups():
    return client.index("apps").search(
        "",
        {
            "facets": ["project_group"],
        },
    )


def get_by_selected_project_groups(
    selected_project_groups: List[str], page: int, hits_per_page: int
):
    project_group_list = [
        f"project_group = {project_group}" for project_group in selected_project_groups
    ]

    return client.index("apps").search(
        "",
        {
            "filter": [project_group_list],
            "sort": ["installs_last_month:desc"],
            "hitsPerPage": hits_per_page or 250,
            "page": page or 1,
        },
    )


def search_apps(query: str):
    query = unquote(query)

    if results := client.index("apps").search(
        query, {"limit": 250, "sort": ["installs_last_month:desc"]}
    ):
        ret = []
        for app in results["hits"]:
            entry = {
                "id": app["app_id"],
                "name": app["name"],
                "summary": app["summary"],
                "icon": app.get("icon"),
            }
            ret.append(entry)

        return ret

    return []
