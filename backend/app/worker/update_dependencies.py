import dramatiq

from .. import config, cron
from ..dependency_index import enumerate_dependencies, index_dependency_ref


@dramatiq.actor(time_limit=120000, max_retries=2)
def update_dependency_ref(state_id: int, commit: str):
    index_dependency_ref(state_id, commit)


@cron.cron("30 4 * * *")
@dramatiq.actor(time_limit=300000, max_retries=0)
def update_dependencies(app_ids: list[str] | None = None):
    # Explicit app lists enable a bounded pilot before full scheduled collection.
    if not config.settings.dependency_index_enabled and app_ids is None:
        return
    for state_id, commit in enumerate_dependencies(app_ids):
        update_dependency_ref.send(state_id, commit)
