from pydantic import BaseModel, Field
from typing import Optional

class DeviceRegistration(BaseModel):
    device_uuid: str = Field(..., description="Unique device identifier")
    device_info: Optional[str] = Field(None, description="Optional device information")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class DeviceInfo(BaseModel):
    device_id: str
    token: str