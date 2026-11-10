# Mixology Printer Bridge (Windows)

Local Windows service for direct BLE access to the SC03h-3714 thermal printer.

## Current capabilities
- Binds only to 127.0.0.1:8765 (never exposed to the LAN).
- Generates a local bearer token in %APPDATA%\\MixologyPrinterBridge\\config.json.
- Allows only the Mixology HTTPS origins.
- Scans for SC03h devices and connects over BLE.
- Verifies the AE00 service, AE01 writable characteristic and AE02 notification characteristic.
- Does not transmit printer commands yet. The iPrint APK's SC03h profile and command constants are known, but its proprietary compressed raster encoder and transfer/acknowledgement framing are not verified. The /v1/print endpoint deliberately returns HTTP 501 without sending any bytes.

## Build
Run the GitHub Actions workflow "Build Mixology Printer Bridge" to produce a Windows x64 executable. The app prints its pairing token at startup; paste it into the DJ booth's local bridge settings.

## Security
The service listens on loopback only, requires a random bearer token, checks browser origins, and does not expose an open network listener. Keep the token private.
