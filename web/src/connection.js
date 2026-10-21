
// VERIFIED PROTOCOL (Ear (a) / Cleffa / Ear 2)
// Source: earweb.bttl.xyz (cleffa.js & bluetooth_socket.js)
// ----------------------------------------------------------------
const SPP_UUID = "aeac4a03-dff5-498f-843a-34487cf133eb";
const BAUD_RATE = 9600;

// Command IDs (Decimal -> Hex)
const CMD_BATTERY_REQ = 49159; // 0xC007
const CMD_BATTERY_RES_1 = 57345; // 0xE001
const CMD_BATTERY_RES_2 = 16391; // 0x4007

// Ear tip fit test (same commands as ear (web)): start it, then the earbuds
// answer with one result byte per side: 0 = good seal, 1 = poor fit, 2 = not in ear
const CMD_FIT_TEST_START = 0xF014; // 61460
const CMD_FIT_TEST_RESULT = 0xE00D; // 57357

// Find my earbuds (ring one earbud)
const CMD_RING = 0xF002; // 61442

const sleep = ms => new Promise(r => setTimeout(r, ms));

// No answer from the earbuds for this long means the link is gone, even when
// Windows never reports it (the read just hangs).
const SILENCE_TIMEOUT_MS = 25000;

export class ConnectionManager {
    constructor() {
        this.port = null;
        this.writer = null;
        this.reader = null;

        // BUFFERING
        this.buffer = [];

        this.isConnected = false;
        this.onBatteryUpdate = null;
        this.opId = 0;
        this.pingInterval = null;
        this.lastRx = 0;

        // Bound once so the listener can be removed again when the port is closed
        this.onPortGone = () => this.handleDisconnect();
    }

    log(msg) { console.log(`[EAR] ${msg}`); }

    async connect() {
        // Start clean. When the earbuds drop (back in the case, Bluetooth off,
        // reconnected in Windows) the old port stays open, and opening it again
        // fails with "The port is already open". That broke Reconnect.
        await this.closePort();

        let port;
        try {
            this.log("Requesting Port...");
            port = await navigator.serial.requestPort({
                allowedBluetoothServiceClassIds: [SPP_UUID],
                filters: [{ bluetoothServiceClassId: SPP_UUID }]
            });
            await this.openWithRetry(port);
        } catch (e) {
            this.log("Connect Failed: " + e.message);
            throw e;
        }
        this.log("Port Open. 9600 Baud.");

        this.port = port;
        this.isConnected = true;
        this.lastRx = Date.now();

        // Notice when the earbuds go away (case closed, out of range, Bluetooth off)
        port.addEventListener('disconnect', this.onPortGone);

        // Only ONE read loop: a second one used to fight over the same stream
        this.readLoop(port).catch(e => this.log("Read loop stopped: " + e.message));

        // Init Sequence (Match cleffa.js: Open -> Battery -> Sync)
        await sleep(100);
        this.log("Requesting Battery...");
        this.sendCommand(CMD_BATTERY_REQ);

        // Start Polling
        this.startPolling();
        return true;
    }

    // Right after Windows reconnects the earbuds, their Bluetooth serial link can
    // need a few seconds before it accepts a connection, so try a few times.
    async openWithRetry(port, attempts = 4) {
        for (let i = 1; ; i++) {
            try {
                await port.open({ baudRate: BAUD_RATE, bufferSize: 4096 });
                return;
            } catch (e) {
                // Still open from the last session: close it, then try again
                if (e?.name === 'InvalidStateError') {
                    try { await port.close(); } catch { /* not open after all */ }
                }
                if (i >= attempts) throw e;
                this.log(`Open attempt ${i} failed (${e.message}), retrying...`);
                await sleep(1500);
            }
        }
    }

    // Release the port completely so the next connect can open it again
    async closePort(port = this.port) {
        if (!port) return;
        if (this.port === port) this.isConnected = false;
        this.stopPolling();
        port.removeEventListener('disconnect', this.onPortGone);

        const reader = this.reader;
        if (reader) {
            try { await reader.cancel(); } catch { /* stream already gone */ }
            try { reader.releaseLock(); } catch { /* already released */ }
        }
        try { await port.close(); } catch { /* already closed or device gone */ }

        if (this.port === port) {
            this.port = null;
            this.reader = null;
            this.writeChain = null;
        }
    }

    // Ask the earbuds for everything the app shows. Each request is independent,
    // so one failing can't stop the others (this was missing and crashed the
    // connect flow into the "LINK OPEN (WARN)" fallback).
    syncAll() {
        const steps = [
            () => this.sendCommand(CMD_BATTERY_REQ),
            () => this.getFirmware(),
            () => this.getGestures()
        ];
        steps.forEach((step, i) => setTimeout(() => {
            try { Promise.resolve(step()).catch(e => this.log("Sync step failed: " + e.message)); }
            catch (e) { this.log("Sync step failed: " + e.message); }
        }, i * 150));
    }

    handleDisconnect() {
        if (!this.isConnected) return;
        this.isConnected = false;
        this.stopPolling();
        this.log("Disconnected");
        // Free the port now, so Reconnect finds it closed
        this.closePort().catch(() => {});
        if (this.onDisconnect) this.onDisconnect();
    }

    async disconnect() {
        this.handleDisconnect();
        await this.closePort();
    }

    sendCommand(cmd, payload = []) {
        if (!this.port || !this.port.writable) return Promise.resolve();

        // Header: [0x55, 0x60, 0x01, CmdLo, CmdHi, Len, 0x00, OpID]
        this.opId = (this.opId + 1) & 0xFF;

        const header = [
            0x55,
            0x60,
            0x01,
            cmd & 0xFF, (cmd >> 8) & 0xFF,
            payload.length,
            0x00,
            this.opId
        ];

        let content = [...header, ...payload];

        // CRC16
        const crc = this.calculateCRC16(content);
        const packet = new Uint8Array([...content, crc & 0xFF, (crc >> 8) & 0xFF]);

        // Queue writes so two commands never grab the stream at the same time
        // (e.g. a quick-tile tap landing during the 5-second battery poll).
        this.writeChain = (this.writeChain || Promise.resolve())
            .then(async () => {
                if (!this.port?.writable) return;
                const writer = this.port.writable.getWriter();
                try { await writer.write(packet); }
                finally { writer.releaseLock(); }
            })
            .catch(e => this.log("Write failed: " + e.message));
        return this.writeChain;
    }

    calculateCRC16(data) {
        let crc = 0xFFFF;
        for (const byte of data) {
            crc ^= byte;
            for (let i = 0; i < 8; i++) {
                if ((crc & 1) !== 0) crc = (crc >> 1) ^ 0xA001;
                else crc = crc >> 1;
            }
        }
        return crc;
    }

    async readLoop(port) {
        this.buffer = [];
        while (port.readable && this.isConnected && this.port === port) {
            const reader = port.readable.getReader();
            this.reader = reader;
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value && value.length) {
                        this.lastRx = Date.now();
                        for (const b of value) this.buffer.push(b);
                        this.processBuffer();
                    }
                }
            } catch (e) {
                this.log("Read error: " + e.message);
                // A read error that isn't recoverable means the link is gone
                if (!port.readable) break;
            }
            finally {
                try { reader.releaseLock(); } catch { /* already released */ }
                if (this.reader === reader) this.reader = null;
            }
        }
        if (this.port === port) this.handleDisconnect();
    }

    processBuffer() {
        // [55, 60, 01, Lo, Hi, Len, 00, Op] (Header is 8 bytes)
        while (this.buffer.length >= 8) {
            // Check Start Byte
            if (this.buffer[0] !== 0x55) {
                this.buffer.shift();
                continue;
            }

            // Get Len (Byte 5)
            const len = this.buffer[5];
            const packetLen = 8 + len + 2;

            if (this.buffer.length < packetLen) return;

            // Extract Packet
            const packet = this.buffer.slice(0, packetLen);
            this.handlePacket(packet);

            // Remove processed
            this.buffer.splice(0, packetLen);
        }
    }

    getCommand(header) {
        // Matches bluetooth_socket.js logic
        // header is full packet here, slice(3,5) is CmdLo, CmdHi
        const cmdLo = header[3];
        const cmdHi = header[4];
        // Little Endian: Lo | (Hi << 8)
        return cmdLo | (cmdHi << 8);
    }

    handlePacket(data) {
        const cmd = this.getCommand(data);

        // DEBUG LOGGING
        const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`RX CMD: ${cmd} (0x${cmd.toString(16).toUpperCase()}) Raw: ${hex}`);

        // Matches bluetooth_socket.js: if (command === 57345 || command===16391)
        if (cmd === CMD_BATTERY_RES_1 || cmd === CMD_BATTERY_RES_2 || cmd === CMD_BATTERY_REQ) {
            this.parseBattery(data);
        }

        // FIRMWARE RESPONSE (0xD001 or 0xC001 typically, let's assume 0xD001 response to 0xC001 request)
        // Actually, let's log everything for now to find it.
        if (cmd === 53249) { // 0xD001 (Response to C001?)
            this.parseFirmware(data);
        }
    }

    parseFirmware(data) {
        // Typically ASCII or BCD. Let's try ASCII.
        // Skip header (8 bytes)
        const payload = data.slice(8, data.length - 2); // Minus CRC
        const str = new TextDecoder().decode(payload);
        this.log(`Firmware: ${str}`);
        // Dispatch event or callback
        if (this.onFirmware) this.onFirmware(str);
    }

    parseBattery(data) {
        try {
            // Index 8 is Count
            if (data.length < 9) return;
            const count = data[8];
            const res = { l: 0, r: 0, c: 0, l_c: false, r_c: false, c_c: false };

            for (let k = 0; k < count; k++) {
                const off = 9 + (k * 2);
                if (off + 1 >= data.length) break;

                const id = data[off];
                const val = data[off + 1];
                const pct = val & 127;
                const chg = (val & 128) === 128;

                // 2=Left, 3=Right, 4=Case (Matches cleffa.js)
                if (id === 2) { res.l = pct; res.l_c = chg; }
                if (id === 3) { res.r = pct; res.r_c = chg; }
                if (id === 4) { res.c = pct; res.c_c = chg; }
            }

            this.log(`Parsed: L:${res.l}% R:${res.r}% C:${res.c}%`);
            if (this.onBatteryUpdate) this.onBatteryUpdate(res);
        } catch (e) { console.error("Batt Parse Error:", e); }
    }

    handlePacket(data) {
        const cmd = this.getCommand(data);
        const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');

        // BATTERY
        if (cmd === CMD_BATTERY_RES_1 || cmd === CMD_BATTERY_RES_2 || cmd === CMD_BATTERY_REQ) {
            this.parseBattery(data);
        }
        // FIRMWARE (0x4042 or 0xD001)
        else if (cmd === 0x4042 || cmd === 0xD001 || cmd === 0x4001) {
            // 0xD001/4001 usually has [SN_Len, SN..., FW_Len, FW...] or similar
            // 0x4042 is just FW string.
            // Let's safe-parse.
            try {
                // If 0x4042, it's direct string at data[8]
                if (cmd === 0x4042) {
                    const ver = Array.from(data.slice(8, 8 + data[5])).map(c => String.fromCharCode(c)).join('');
                    if (this.onFirmware) this.onFirmware(ver);
                }
                // If 0xD001/0x4001: complex payload. 
                // Often: Byte 8=SN Len, Then SN, Then FW Len, Then FW.
                else {
                    // Quick & Dirty: Look for a string pattern like "1.0." inside the payload
                    const rawStr = Array.from(data.slice(8)).map(c => String.fromCharCode(c)).join('');
                    const match = rawStr.match(/(\d+\.\d+\.\d+\.\d+)/);
                    if (match && this.onFirmware) this.onFirmware(match[0]);
                }
            } catch (e) { console.error("FW Parse:", e); }
        }
        // ANC RESPONSE (0x401E or 0xE003)
        else if (cmd === 0x401E || cmd === 0xE003) {
            // Byte 9 is ANC Status
            const status = data[9];
            // Map back to UI values (Reverse of setANC)
            // 5=Off, 2=High, 3=Mid, 4=Low, 1=Adapt, 7=Trans
            let uiMode = 5;
            if (status === 2) uiMode = 1; // High
            if (status === 3) uiMode = 2; // Mid
            if (status === 4) uiMode = 3; // Low
            if (status === 1) uiMode = 4; // Adapt
            if (status === 7) uiMode = 7; // Trans
            if (status === 5) uiMode = 5; // Off
            if (this.onANCUpdate) this.onANCUpdate(uiMode);
        }
        // EQ RESPONSE (0x401F)
        else if (cmd === 0x401F) {
            const eq = data[8];
            if (this.onEQUpdate) this.onEQUpdate(eq);
        }
        // BASS RESPONSE (0x404E)
        else if (cmd === 0x404E) {
            const enabled = data[8];
            const level = data[9]; // usually raw level (not doubled?) Ref says level/2
            if (this.onBassUpdate) this.onBassUpdate(enabled, level / 2);
        }
        // GESTURE (0x4018)
        else if (cmd === 0x4018) {
            this.parseGesturePacket(data);
        }
        else {
            // console.log(`RX CMD: ${cmd} (0x${cmd.toString(16).toUpperCase()}) Raw: ${hex}`);
        }
    }

    // Gesture: side (left = 2, right = 3), gesture type and action code (see gestures.js)
    setGesture(side, gestureType, actionId) {
        const sideByte = side === 'left' ? 2 : 3;
        const payload = [0x01, sideByte, 0x01, gestureType, actionId];
        this.sendCommand(0xF003, payload);
    }

    // Find my earbuds: make one earbud chirp loudly (0xF002, same as ear (web)).
    // Payload: side (2 = left, 3 = right), then 1 = ring / 0 = stop.
    ringBud(side, on) {
        this.log(`${on ? 'Ringing' : 'Stopping'} ${side} earbud`);
        return this.sendCommand(CMD_RING, [side === 'left' ? 0x02 : 0x03, on ? 0x01 : 0x00]);
    }

    // Attempt to READ Gestures (Verified 0xC018)
    getGestures() {
        this.log("Syncing Settings (0xC018)...");
        this.sendCommand(0xC018, []);
    }

    // ...

    handlePacket(data) {
        const cmd = this.getCommand(data);
        const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');

        // BATTERY
        if (cmd === CMD_BATTERY_RES_1 || cmd === CMD_BATTERY_RES_2 || cmd === CMD_BATTERY_REQ) {
            this.parseBattery(data);
        }
        // FIRMWARE (0x4042 / 16450)
        else if (cmd === 0x4042) {
            const len = data[5];
            const ver = Array.from(data.slice(8, 8 + len)).map(c => String.fromCharCode(c)).join('');
            if (this.onFirmware) this.onFirmware(ver);
        }
        // GESTURE RESPONSE (0x4018)
        else if (cmd === 0x4018) {
            this.parseGesturePacket(data);
        }
        // EAR TIP FIT TEST RESULT (0xE00D): payload byte 0 = left, byte 1 = right
        else if (cmd === CMD_FIT_TEST_RESULT) {
            this.log(`Fit test result: L=${data[8]} R=${data[9]}`);
            if (this.onFitTest) this.onFitTest(data[8], data[9]);
        }
        else {
            // console.log(`RX CMD: ${cmd} (0x${cmd.toString(16).toUpperCase()}) Raw: ${hex}`);
        }
    }

    parseGesturePacket(data) {
        console.log("Parsing Gestures...");
        // Byte 8: Count
        const count = data[8];
        const gestures = [];

        for (let i = 0; i < count; i++) {
            const offset = 9 + (i * 4);
            if (offset + 3 < data.length) {
                gestures.push({
                    side: (data[offset] === 2) ? 'left' : 'right',
                    type: data[offset + 2], // 2 = double, 3 = triple, 7 = hold, 9 = double + hold
                    action: data[offset + 3]
                });
            }
        }
        if (this.onGestureUpdate) this.onGestureUpdate(gestures);
    }

    // 1. Firmware (0xC042 / 49218) - Strict Reference Implementation
    getFirmware() {
        this.log("Sync: Firmware (0xC042)");
        this.sendCommand(0xC042, []);
    }

    startPolling() {
        this.stopPolling();
        this.pingInterval = setInterval(() => {
            if (!this.isConnected) return;
            // Windows doesn't always tell us the earbuds are gone; silence does
            if (this.lastRx && Date.now() - this.lastRx > SILENCE_TIMEOUT_MS) {
                this.log("No answer from the earbuds, treating the link as lost");
                this.handleDisconnect();
                return;
            }
            this.sendCommand(CMD_BATTERY_REQ);
        }, 5000);
    }

    stopPolling() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = null;
    }

    // ANC MAPPING (Based on bluetooth_socket.js)
    // UI Sends: 1(High), 2(Mid), 3(Low), 4(Adaptive), 7(Trans), 5(Off)
    // Protocol Expects: 0x05(High), 0x04(Mid), 0x03(Low), 0x01(Adapt), 0x07(Trans), 0x02(Off)
    setANC(uiMode) {
        let protoMode = 0x05; // Default Off (0x05)
        switch (uiMode) {
            case 1: protoMode = 0x02; break; // High
            case 2: protoMode = 0x03; break; // Mid (Was 0x04, User says swapped)
            case 3: protoMode = 0x04; break; // Low (Was 0x03, User says swapped)
            case 4: protoMode = 0x01; break; // Adaptive
            case 7: protoMode = 0x07; break; // Transparency
            case 5: protoMode = 0x05; break; // Off (User says 0x05 is OFF)
            default: protoMode = 0x05;
        }
        this.log(`Set ANC: UI=${uiMode} -> Proto=0x${protoMode.toString(16)}`);
        this.sendCommand(0xF00F, [0x01, protoMode, 0x00]);
    }

    setEQ(preset) {
        // 1=Balanced, 2=More Bass, 3=More Treble, 4=Voice
        this.log(`Set EQ: ${preset}`);
        this.sendCommand(0xF010, [preset, 0x00]);
    }

    setBass(enabled, level) {
        // ID 0xF051 (61521). Level is 1-5. Verify mult * 2
        this.log(`Set Bass: On=${enabled} Lvl=${level}`);
        this.sendCommand(0xF051, [enabled ? 1 : 0, level * 2]);
    }

    setLowLatency(enabled) {
        // ID 0xF040 (61504). 1=On, 2=Off
        this.log(`Set Game Mode: ${enabled}`);
        this.sendCommand(0xF040, [enabled ? 1 : 2, 0x00]);
    }

    startFitTest() {
        this.log("Starting ear tip fit test");
        return this.sendCommand(CMD_FIT_TEST_START, [0x01]);
    }

    setInEar(enabled) {
        this.log(`Set In-Ear: ${enabled}`);
        this.sendCommand(0xF004, [0x01, 0x01, enabled ? 1 : 0]);
    }
}
