from __future__ import annotations
import asyncio
import json
import os
import secrets
import threading
from pathlib import Path
from typing import Any
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from bleak import BleakClient, BleakScanner
import uvicorn

APP_NAME = "Mixology Printer Bridge"
TARGET_NAME = "SC03h-3714"
SERVICE_UUIDS = {"0000ae00-0000-1000-8000-00805f9b34fb"}
WRITE_UUIDS = {"0000ae01-0000-1000-8000-00805f9b34fb"}
NOTIFY_UUIDS = {"0000ae02-0000-1000-8000-00805f9b34fb"}
ORIGINS = {"https://mixology.monster", "https://www.mixology.monster"}
CONFIG_DIR = Path(os.getenv("APPDATA", str(Path.home()))) / "MixologyPrinterBridge"
CONFIG_FILE = CONFIG_DIR / "config.json"

def load_token() -> str:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(data.get("token"), str) and len(data["token"]) >= 32:
                return data["token"]
        except Exception:
            pass
    token = secrets.token_urlsafe(32)
    CONFIG_FILE.write_text(json.dumps({"token": token}, indent=2), encoding="utf-8")
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except OSError:
        pass
    return token

TOKEN = load_token()
app = FastAPI(title=APP_NAME, docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

class ConnectRequest(BaseModel):
    address: str = Field(min_length=1, max_length=64)

class PrintRequest(BaseModel):
    track_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    requester: str = Field(default="Guest", max_length=120)

class BridgeState:
    def __init__(self):
        self.client: BleakClient | None = None
        self.address: str | None = None
        self.name: str | None = None
        self.write_uuid: str | None = None
        self.notify_uuid: str | None = None
        self.last_notification: str | None = None
        self.lock = asyncio.Lock()

state = BridgeState()

def authorize(value: str | None):
    if not value or not secrets.compare_digest(value.removeprefix("Bearer ").strip(), TOKEN):
        raise HTTPException(status_code=401, detail="Invalid bridge token")

def require_auth(authorization: str | None = Header(default=None)):
    authorize(authorization)

@app.get("/v1/status")
async def status(authorization: str | None = Header(default=None)):
    authorize(authorization)
    connected = bool(state.client and state.client.is_connected)
    return {
        "app": APP_NAME,
        "version": "0.1.0",
        "printer": TARGET_NAME,
        "connected": connected,
        "address": state.address if connected else None,
        "name": state.name if connected else None,
        "service_found": bool(connected and state.write_uuid),
        "write_characteristic": state.write_uuid,
        "notify_characteristic": state.notify_uuid,
        "protocol_ready": False,
        "print_enabled": False,
        "message": "BLE discovery and connection are available. SC03h image encoder and transfer framing are not yet verified; print transmission is intentionally locked."
    }

@app.post("/v1/scan")
async def scan(authorization: str | None = Header(default=None)):
    authorize(authorization)
    devices = await BleakScanner.discover(timeout=8.0, return_adv=True)
    found = []
    for _, pair in devices.items():
        device, adv = pair
        name = device.name or adv.local_name or ""
        if TARGET_NAME.lower() in name.lower() or name.lower().startswith("sc03h"):
            found.append({"name": name, "address": device.address, "rssi": adv.rssi})
    return {"devices": found}

@app.post("/v1/connect")
async def connect(req: ConnectRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    async with state.lock:
        if state.client and state.client.is_connected:
            await state.client.disconnect()
        state.client = None
        state.address = None
        state.write_uuid = None
        state.notify_uuid = None
        client = BleakClient(req.address, timeout=20.0)
        try:
            await client.connect()
            services = client.services
            service = next((s for s in services if s.uuid.lower() in SERVICE_UUIDS), None)
            if service is None:
                await client.disconnect()
                raise HTTPException(status_code=422, detail="Connected, but the expected AE00 printer service was not found.")
            write_char = next((c for c in service.characteristics if c.uuid.lower() in WRITE_UUIDS and ("write" in c.properties or "write-without-response" in c.properties)), None)
            notify_char = next((c for c in service.characteristics if c.uuid.lower() in NOTIFY_UUIDS and ("notify" in c.properties or "indicate" in c.properties)), None)
            if write_char is None:
                await client.disconnect()
                raise HTTPException(status_code=422, detail="AE00 found, but writable AE01 characteristic was not found.")
            state.client = client
            state.address = req.address
            state.name = TARGET_NAME
            state.write_uuid = write_char.uuid
            state.notify_uuid = notify_char.uuid if notify_char else None
            if notify_char:
                await client.start_notify(notify_char.uuid, lambda _sender, data: setattr(state, "last_notification", bytes(data).hex()))
            return {"connected": True, "name": state.name, "address": req.address, "write_characteristic": state.write_uuid, "notify_characteristic": state.notify_uuid, "protocol_ready": False}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"BLE connection failed: {type(exc).__name__}: {exc}")

@app.post("/v1/disconnect")
async def disconnect(authorization: str | None = Header(default=None)):
    authorize(authorization)
    async with state.lock:
        if state.client and state.client.is_connected:
            await state.client.disconnect()
        state.client = None
        state.address = None
        state.write_uuid = None
        state.notify_uuid = None
    return {"connected": False}

@app.post("/v1/print")
async def print_track(req: PrintRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    if not state.client or not state.client.is_connected:
        raise HTTPException(status_code=409, detail="Printer is not connected.")
    # Deliberately fail closed until the proprietary SC03h compressed image
    # payload and chunk/acknowledgement protocol have been ported and tested.
    raise HTTPException(
        status_code=501,
        detail="Printer connected, but SC03h print encoder/transfer is not verified. No bytes were sent."
    )

@app.get("/health")
async def health():
    return {"ok": True, "app": APP_NAME, "version": "0.1.0"}

def main():
    print(f"{APP_NAME} starting on http://127.0.0.1:8765")
    print("Pairing token (paste into Mixology DJ booth):")
    print(TOKEN)
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")

if __name__ == "__main__":
    main()
