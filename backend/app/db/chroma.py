import chromadb
from app.config import settings

_client = None


def get_chroma():
    global _client
    if _client is None:
        _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    return _client


def collection_for(bot_id: str):
    client = get_chroma()
    return client.get_or_create_collection(name=f"bot_{bot_id}")
