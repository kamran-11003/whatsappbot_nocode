from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "whatsapp_mate"
    redis_url: str = "redis://localhost:6379/0"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    backend_port: int = 8000

    # Scaling knobs
    stream_partitions: int = 16
    redis_pool_size: int = 100
    mongo_pool_size: int = 200
    worker_mode: str = "all"  # "inbound" | "jobs" | "all"
    worker_concurrency: int = 20  # in-flight messages per worker process

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
