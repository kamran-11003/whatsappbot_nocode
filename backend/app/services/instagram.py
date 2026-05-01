"""Instagram DM Send API wrapper.

Instagram Direct uses the exact same Messenger Send API endpoint
(graph.facebook.com/v20.0/me/messages) with an Instagram-linked
Page Access Token. The only structural difference is that recipient
IDs are Instagram-scoped user IDs (IGSIDs) instead of Facebook PSIDs.

This module delegates entirely to messenger.py — it exists as a
separate file so channel_router.py can import it cleanly and future
IG-specific behaviour (e.g. story replies) can be added here.
"""
from app.services.messenger import (
    send_text,
    send_buttons,
    send_image,
    send_video,
    send_audio,
    send_document,
    extract_user_text,
    extract_user_payload,
)

__all__ = [
    "send_text",
    "send_buttons",
    "send_image",
    "send_video",
    "send_audio",
    "send_document",
    "extract_user_text",
    "extract_user_payload",
]
