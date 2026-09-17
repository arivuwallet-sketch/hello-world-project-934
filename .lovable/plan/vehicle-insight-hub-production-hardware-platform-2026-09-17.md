# Vehicle Insight Hub — production hardware platform

## Goal
Upgrade the referenced repository into a real-hardware-only OBD-II, CAN, EV, OBFCM, diagnostics, calibration-analysis, and authorized-programming platform. Preserve working diagnostics and remove any path that invents vehicle data or reports success without a verified hardware response.

## Non-negotiable behavior
- No simulator, demo vehicle, generated telemetry, guessed decoding, fake progress, or placeholder values.
- Every displayed value carries source, ECU/header, raw response, timestamp, age, latency, and quality when available.
- Missing or unsupported information uses the specified standard error states, never zero or fabricated content.
- Write operations require explicit authorization, compatible hardware, stable preconditions, a real backup, validation, verification, and an immutable audit record.
- Manufacturer-specific definitions remain unavailable until a licensed, validated dataset supplies them.

## Delivery stages

### 1. Import and harden the existing application
- Bring the public Vehicle Insight Hub repository into this project while preserving its TanStack structure, routes, design system, PWA, tests, ELM327/STN transport, PID parsing, DTCs, freeze frame, readiness, CAN monitor, garage, and real session recording.
- Rename the product to Vehicle Insight Hub and add complete per-page metadata.
- Audit all state and UI for fake/default values, false success messages, unsafe raw commands, stale-data ambiguity, and unsupported capability claims.
- Replace browser-local persistence for durable vehicle/session/audit records with Lovable Cloud; keep transient live samples in memory.

### 2. Typed hardware and capability layer
- Define a unified adapter contract: connect, disconnect, reconnect, capabilities, command/raw I/O, receive/subscribe, protocol, latency, signal status, firmware, voltage, and streaming.
- Implement real Web Serial, Web Bluetooth, and WebUSB drivers with secure-context and permission detection.
- Preserve ELM327/STN initialization but validate each command response and detect capabilities behaviorally.
- Add explicit extension points for Wi-Fi gateways, professional CAN interfaces, and an authenticated signed native bridge.
- Treat J2534 as native-bridge-only; the browser will never claim direct J2534 access.

### 3. Protocol, transport, and response integrity
- Add protocol state for ISO 15765-4 CAN (11/29-bit), ISO 9141-2, KWP2000, J1850 PWM/VPW, and future J1939.
- Add strict ELM response classification for OK, NO DATA, ERROR, STOPPED, TIMEOUT, UNKNOWN COMMAND, CAN/BUS errors, and negative diagnostic responses.
- Implement ISO-TP single/first/consecutive/flow-control parsing, reassembly, sequence validation, block size, STmin, and timeout handling.
- Build a normalized diagnostic envelope carrying TX/RX bytes, addressing, ECU, service, identifier, timing, transport, protocol, and validation result.

### 4. Standards and dataset registry
- Expand Mode 01 definitions only from a documented SAE J1979-compatible source and record exact revision/source/license/import date.
- Add declarative dataset types, provenance, loader, registry, conflict detection, checksum, schema/file-size/range/formula validation, and version retention.
- Support validated OBDb JSON, OBDb SAEJ1979 JSON, opendbc/DBC-derived JSON, Torque CSV, and future adapters without executing imported code.
- Import the iternio EV source only after confirming its current license and provenance requirements.
- Add a Data Sources page showing classification, provenance, version, checksum, entry count, and conflict/status information.

### 5. Diagnostic pipeline and scheduler
- Enforce raw response → mode/PID/length validation → extraction → declarative decode → conversion → range validation → timestamp → quality.
- Build real supported-PID discovery with supported, unsupported, unknown, failed, and stale states.
- Replace simple polling with a priority queue respecting adapter/ECU timing, timeout, retry/backoff, unsupported signals, cancellation, and connection state.
- Add a source inspector for every resolved signal and a raw console with actual TX/RX metadata.

### 6. Core diagnostic experiences
- Upgrade the dense live dashboard to show only actual available values and explicit unavailable/stale states.
- Implement standardized Modes 01, 02, 03, 04, 05, 06, 07, 08, 09, and 0A behind discovered capability checks.
- Harden DTC, clear-DTC confirmation/result validation, freeze frame isolation, readiness states, VIN validation, ECU discovery, and CAN monitoring.
- Add true recording and historical-real-session inspection without replay simulation.

### 7. OBFCM and EV
- Add strict Mode 09 InfoType 17 OBFCM parsing with payload/version validation and ECU-reported versus calculated labeling.
- Add dataset-driven EV signals; no universal EV PID assumptions.
- Show unavailable states whenever a vehicle, ECU, adapter, or imported dataset cannot supply a verified definition.

### 8. UDS and authorized programming
- Implement UDS framing and typed responses for session control, reset, read/write DID, routine control, download, transfer, exit, and security access.
- Never brute-force, infer, or bypass security; security algorithms and write definitions must come from authorized external/native providers.
- Build calibration intake, original-image backup, compatibility checks, declarative map editing, checksum-provider interface, preflight, programming, verification, recovery-required state, and audit log.
- Enable actual flashing only through a compatible authenticated native/J2534 bridge or hardware driver that reports each real ECU response. Without that bridge and OEM definitions, the UI remains read/analysis-only and reports `UNSUPPORTED BY ADAPTER`, `OEM DEPENDENT`, or `AUTHORIZATION REQUIRED`.

### 9. Verification and release gates
- Add unit tests for parsers, PID formulas, provenance, conflicts, ISO-TP, UDS negative responses, scheduler behavior, and all error-state mappings.
- Add browser tests for unsupported APIs, denied permission, disconnect/stale transitions, dataset import, destructive confirmations, and programming interlocks.
- Verify desktop/mobile layouts, PWA behavior, accessibility, route metadata, and that no synthetic data path remains.
- Hardware validation matrices remain explicitly unverified until exercised against physical adapters, ECUs, and authorized programming equipment.

## Technical boundaries
- Browser APIs can support compatible USB serial, BLE GATT, and some WebUSB devices after an explicit user gesture and permission.
- Classic Bluetooth SPP and raw Wi-Fi TCP sockets are not directly available to browser code.
- J2534 DLLs and many professional interfaces require a signed local/native bridge; the web app supplies a secured bridge contract, not a fake fallback.
- ECU flashing is vehicle-, ECU-, firmware-, dataset-, voltage-, and tooling-dependent. No generic “flash any ECU” claim will be made.
- SAE documents may be copyrighted. The registry will store permitted metadata/definitions from verified licensed sources rather than copying restricted material.

## Acceptance criteria
- The disconnected first run contains no vehicle values and clearly says the adapter is not connected.
- No signal appears without traceable real or historical-real provenance.
- No unsupported mode, PID, ECU, CAN feature, EV signal, OBFCM value, or programming capability appears as available.
- No destructive operation reports success without a validated positive response and verification where required.
- All imported definitions are declarative, validated, provenance-complete, versioned, and conflict-safe.
- Automated tests pass; hardware-dependent items are labeled pending until tested with the required physical equipment.
