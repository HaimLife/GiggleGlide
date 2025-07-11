from fastapi import APIRouter, HTTPException, status
from datetime import timedelta

from models.auth import DeviceRegistration, TokenResponse
from utils.auth import create_access_token
from config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register-device", response_model=TokenResponse)
async def register_device(device: DeviceRegistration):
    """
    Register a device and receive an access token.
    """
    # In a production app, you might want to store device info in a database
    # For now, we'll just create a token with the device UUID
    
    access_token = create_access_token(
        data={"device_id": device.device_uuid},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # Convert to seconds
    )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(device_id: str):
    """
    Refresh an access token for a device.
    """
    # In production, verify the device exists in your database
    
    access_token = create_access_token(
        data={"device_id": device_id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )