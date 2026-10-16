// KNOWN SERVICE UUIDS (Nothing & Standard)
const SERVICES = [
    "00000001-0000-1000-8000-00805f9b34fb", // Nothing/Ear Custom Service (High Priority)
    "0000fe03-0000-1000-8000-00805f9b34fb", // Common Audio Service
    // "00001101-0000-1000-8000-00805f9b34fb", // SPP (Removed: Unreliable in WebBLE)
    "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART (Reliable Data Pipe)
    // Specific Nothing Custom Services (High Probability)
    "00000000-0000-1000-8000-00805f9b34fb",
    "00000002-0000-1000-8000-00805f9b34fb",
    "00000003-0000-1000-8000-00805f9b34fb",
    "00000004-0000-1000-8000-00805f9b34fb",
    "00000005-0000-1000-8000-00805f9b34fb",
    "00000006-0000-1000-8000-00805f9b34fb",
    // Common FD range
    "0000fd00-0000-1000-8000-00805f9b34fb",
    "0000fd01-0000-1000-8000-00805f9b34fb"
];

// KNOWN CHARACTERISTICS (For auto-binding)
const CHAR_UUIDS = {
    CONTROL: "000033f1-0000-1000-8000-00805f9b34fb",
    NOTIFY: "000033f2-0000-1000-8000-00805f9b34fb",
    NORDIC_TX: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    NORDIC_RX: "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
};

export class EarController {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.txChar = null;
        this.rxChar = null;
        this.onBatteryUpdate = null;
        this.onDisconnect = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            console.log("Requesting Device...");
            // 1. Request Device with ALL potential services
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: "Nothing" },
                    { namePrefix: "Ear" }
                ],
                optionalServices: SERVICES // Must ask for permission for ALL
            });

            this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

            console.log("Connecting to GATT Server...");
            this.server = await this.device.gatt.connect();

            // 2. Find the Working Service
            await this.findWorkingService();

            if (!this.service) {
                throw new Error("Connected, but no supported service found.");
            }

            // 3. Setup Characteristics (TX/RX)
            await this.setupCharacteristics();

            // 4. Start Listeners
            if (this.rxChar) {
                try {
                    await this.rxChar.startNotifications();
                    this.rxChar.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));
                    console.log("Notifications started.");
                } catch (e) {
                    console.warn("Could not start notifications (Hybrid mode?):", e);
                }
            }

            this.isConnected = true;

            // 5. Initial Commands
            await new Promise(r => setTimeout(r, 500)); // Stability delay

            console.log("Sending Handshake...");
            await this.sendCommand(0xC006); // HANDSHAKE / INIT
            await new Promise(r => setTimeout(r, 500));

            await this.sendCommand(0xC007); // Get Battery

            this.startBatteryPolling(); // Start periodic updates

            return true;

        } catch (e) {
            console.error("Connection Flow Failed:", e);
            if (this.device && this.device.gatt.connected) this.device.gatt.disconnect();
            throw e;
        }
    }

    startBatteryPolling() {
        if (this.battInterval) clearInterval(this.battInterval);
        this.battInterval = setInterval(() => {
            if (this.isConnected) {
                console.log("Polling Battery...");
                this.sendCommand(0xC007);
            }
        }, 10000); // Poll every 10s
    }

    async findWorkingService() {
        console.log("Searching for primary service...");
        for (const uuid of SERVICES) {
            try {
                const svc = await this.server.getPrimaryService(uuid);
                console.log("✅ Found Valid Service:", uuid);
                this.service = svc;
                return; // Found one!
            } catch (e) {
                // Ignore "Mismatched" or "Not found", try next
            }
        }
        // Fallback: Try getting ALL services
        try {
            const allServices = await this.server.getPrimaryServices();
            if (allServices.length > 0) {
                console.log("✅ Found Service via List:", allServices[0].uuid);
                this.service = allServices[0];
            }
        } catch (e) { console.log("Fallback discovery failed"); }
    }

    async setupCharacteristics() {
        console.log("Getting Characteristics...");
        const chars = await this.service.getCharacteristics();

        // Log all found for debugging
        chars.forEach(c => console.log(`Found Char: ${c.uuid} [${Object.keys(c.properties).filter(k => c.properties[k]).join(',')}]`));

        // 1. Try Specific Known UUIDs first
        this.txChar = chars.find(c => c.uuid === CHAR_UUIDS.CONTROL || c.uuid === CHAR_UUIDS.NORDIC_TX);
        this.rxChar = chars.find(c => c.uuid === CHAR_UUIDS.NOTIFY || c.uuid === CHAR_UUIDS.NORDIC_RX);

        // 2. Fallback: Find ANY compatible characteristic
        if (!this.txChar) {
            console.log("Specific TX not found, using generic writable...");
            this.txChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
        }
        if (!this.rxChar) {
            console.log("Specific RX not found, using generic notify...");
            this.rxChar = chars.find(c => c.properties.notify || c.properties.indicate);
        }

        if (!this.txChar) throw new Error("No Writable Characteristic found in service!");
        console.log(`Bound TX: ${this.txChar.uuid}, RX: ${this.rxChar ? this.rxChar.uuid : 'NONE'}`);
    }

    handleDisconnect() {
        console.log("Device Disconnected");
        this.isConnected = false;
        if (this.battInterval) clearInterval(this.battInterval);
        this.device = null;
        this.server = null;
        if (this.onDisconnect) this.onDisconnect();
    }

    handleNotification(event) {
        const data = new Uint8Array(event.target.value.buffer);
        // Basic Packet Parsing
        if (data.length > 5) {
            const cmd = data[3] | (data[4] << 8);
            if (cmd === 49159) this.parseBattery(data);
        }
    }

    parseBattery(data) {
        // Battery Packet Structure:
        // [Head, Len, ..., Cmd, ..., Count, [ID, Val]...]
        // Offsets can vary slightly, but around index 8/9 usually
        // We scan for the device count byte

        try {
            const countIndex = 8;
            const count = data[countIndex];
            const res = { l: 0, r: 0, c: 0, l_c: false, r_c: false, c_c: false };

            for (let i = 0; i < count; i++) {
                const off = countIndex + 1 + (i * 2);
                if (off + 1 >= data.length) break;

                const id = data[off];
                const raw = data[off + 1];
                const level = raw & 127;
                const charging = (raw & 128) === 128;

                if (id === 0x02) { res.l = level; res.l_c = charging; }
                if (id === 0x03) { res.r = level; res.r_c = charging; }
                if (id === 0x04) { res.c = level; res.c_c = charging; }
            }
            if (this.onBatteryUpdate) this.onBatteryUpdate(res);
        } catch (e) { console.error("Batt Parse Error", e); }
    }

    async sendCommand(cmdId, payload = []) {
        if (!this.isConnected || !this.txChar) return;

        const packet = this.createPacket(cmdId, payload);
        try {
            await this.txChar.writeValue(packet);
        } catch (e) {
            console.warn("Send Failed:", e);
        }
    }

    createPacket(cmdId, payload) {
        // Header: [0x55, LenL, LenH, CmdL, CmdH, 0x00, 0x00]
        const len = payload.length + 2;
        const header = [
            0x55,
            len & 0xFF, (len >> 8) & 0xFF,
            cmdId & 0xFF, (cmdId >> 8) & 0xFF,
            0x00, 0x00
        ];

        const content = [...header, ...payload];
        const crc = this.calculateCRC16(content);

        return new Uint8Array([...content, crc & 0xFF, (crc >> 8) & 0xFF]);
    }

    calculateCRC16(data) {
        let crc = 0xFFFF;
        for (const byte of data) {
            crc ^= byte;
            for (let i = 0; i < 8; i++) {
                if ((crc & 1) !== 0) {
                    crc = (crc >> 1) ^ 0xA001;
                } else {
                    crc = crc >> 1;
                }
            }
        }
        return crc;
    }

    // --- API Commands ---
    setANC(mode) {
        // Mode: 1=High, 2=Mid, 3=Low, 4=Adapt, 5=Off, 7=Trans
        this.sendCommand(0xF00F, [0x01, mode, 0x00]);
    }

    setEQ(preset) {
        // 1=Bal, 2=Bass, 3=Treb, 4=Voice
        this.sendCommand(0xF010, [preset, 0x00]);
    }

    setBass(enabled, level) {
        // Lvl 1-5 maps to higher internal vals usually * 2? 
        // Keeping it simple for now
        this.sendCommand(0xF051, [enabled ? 1 : 0, level * 2]);
    }

    setLowLatency(enabled) {
        // 1=On, 2=Off (Sometimes 0=Off)
        this.sendCommand(0xF040, [enabled ? 1 : 2, 0x00]);
    }

    setInEar(enabled) {
        // [01, 01, Enabled]
        this.sendCommand(0xF004, [0x01, 0x01, enabled ? 1 : 0]);
    }
}
