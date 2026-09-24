from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, field_validator


def now():
    return datetime.now(timezone.utc)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class EventKind(StrEnum):
    delivered = 'package_delivered'
    motion = 'motion'
    approach = 'person_approached'
    linger = 'person_lingering'
    removed = 'package_removed'
    entered = 'entered_home'
    doorbell = 'doorbell'


Identifier = Annotated[str, Field(pattern=r'^[a-zA-Z0-9_-]{1,100}$')]


class Observations(StrictModel):
    duration_seconds: float = Field(default=0, ge=0, le=86400)
    looking_around: bool = False
    # No face, identity, demographic, or arbitrary instruction-bearing fields.


class EventIn(StrictModel):
    event_id: Identifier
    delivery_id: Identifier
    camera_id: Identifier
    kind: EventKind
    occurred_at: AwareDatetime
    confidence: float = Field(default=1, ge=0, le=1)
    observations: Observations = Field(default_factory=Observations)
    # Opaque storage references; the API never fetches caller-controlled URLs.
    media_ref: Annotated[str, Field(pattern=r'^[a-zA-Z0-9_./-]{1,250}$')] | None = None

    @field_validator('occurred_at')
    @classmethod
    def utc_timestamp(cls, value):
        if (value - now()).total_seconds() > 300:
            raise ValueError('event may not be more than five minutes in the future')
        return value.astimezone(timezone.utc)


class PickupIn(StrictModel):
    delivery_id: Identifier
    starts_at: AwareDatetime
    ends_at: AwareDatetime


class Confirmation(StrictModel):
    outcome: Annotated[str, Field(pattern=r'^(expected|missing|unsure)$')]


class ActionDecision(StrictModel):
    approved: bool


class Question(StrictModel):
    intent: Annotated[str, Field(pattern=r'^(package_status|today_summary|safety_status)$')]
    delivery_id: Identifier | None = None
