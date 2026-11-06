import dramatiq

from .dramatiq_broker import broker
from .quality_analysis import TTL, process_analysis

__all__ = ["broker", "run_quality_analysis"]


@dramatiq.actor(
    queue_name="quality-analysis", max_retries=0, time_limit=900_000, max_age=TTL * 1000
)
def run_quality_analysis(analysis_id: str):
    process_analysis(analysis_id)
