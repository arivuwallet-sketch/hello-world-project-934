# Vehicle Insight Hub Local Agent

This loopback-only companion exposes real native drivers to the web app. It contains no emulated adapters or vehicle responses.

Security requirements:

- Set a high-entropy `VIH_AGENT_TOKEN`; the app must pair with the same token.
- Set `VIH_ALLOWED_ORIGINS` to the exact preview and published origins.
- The service binds only to `127.0.0.1`, validates origins and requests, rate-limits clients and logs operations without payloads.
- Register signed real drivers for serial, Bluetooth SPP, BLE, USB, SocketCAN, J2534, DoIP or vendor interfaces. No driver is bundled or claimed available by default.

Run with Node 20+ after configuring the two variables. Production packaging, signed installers and native drivers are platform-specific and must be supplied and validated against physical hardware.