import json
import aio_pika
from app.config import settings

_connection: aio_pika.RobustConnection | None = None
_channel: aio_pika.abc.AbstractRobustChannel | None = None

OUTBOUND_QUEUE = "outbound.send"
JOBS_QUEUE = "jobs.heavy"
DELAYED_QUEUE = "jobs.delayed"


async def get_channel() -> aio_pika.abc.AbstractRobustChannel:
    global _connection, _channel
    if _channel is None or _channel.is_closed:
        _connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        _channel = await _connection.channel()
        await _channel.set_qos(prefetch_count=10)
        await _channel.declare_queue(OUTBOUND_QUEUE, durable=True)
        await _channel.declare_queue(JOBS_QUEUE, durable=True)
        await _channel.declare_queue(DELAYED_QUEUE, durable=True)
    return _channel


async def publish(queue: str, payload: dict, delay_ms: int = 0):
    ch = await get_channel()
    headers = {}
    if delay_ms > 0:
        headers["x-delay"] = delay_ms
    msg = aio_pika.Message(
        body=json.dumps(payload).encode(),
        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        headers=headers,
    )
    await ch.default_exchange.publish(msg, routing_key=queue)


async def publish_outbound(payload: dict):
    await publish(OUTBOUND_QUEUE, payload)


async def publish_job(payload: dict, delay_ms: int = 0):
    await publish(JOBS_QUEUE if delay_ms == 0 else DELAYED_QUEUE, payload, delay_ms=delay_ms)
