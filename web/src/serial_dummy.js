
// Web Serial Implementation (The "Port" Switch)
export class SerialController {
    constructor() {
        this.port = null;
        this.writer = null;
        this.reader = null;
        this.isConnected = false;
        this.onBatteryUpdate = null;
        this.keepReading = false;
    }

    async connect() {
        try {
            // Request Port (User Selects COM Port)
            this.port = await navigator.serial.requestPort({ filters: [] });
            await this.port.open({ baudRate: 115200 }); // Standard speed

            this.isConnected = true;
            this.keepReading = true;

            // Start Readers/Writers
            const encoder = new TextEncoderStream();
            this.writer = encoder.writable.getWriter(); // Setup writer (if needed, or raw)
            // Actually, binary is better for Nothing packets

            this.readLoop();

            // Handshake
            await this.sendCommand(0xC006);
            await new Promise(r => setTimeout(r, 500));
            await this.sendCommand(0xC007);
            this.startPolling();

            return true;
        } catch (e) {
            console.error("Serial Connect Failed:", e);
            throw e;
        }
    }

    async sendCommand(cmdId, payload = []) {
        if (!this.port || !this.port.writable) return;

        // Use same Packet Logic as Bluetooth
        const packet = this.createPacket(cmdId, payload);

        const writer = this.port.writable.getWriter();
        await writer.write(packet);
        writer.releaseLock();
    }

    async readLoop() {
        while (this.port.readable && this.keepReading) {
            const reader = this.port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) this.handleData(value);
                }
            } catch (e) { console.error(e); }
            finally { reader.releaseLock(); }
        }
    }

    // ... Copy createPacket, handleData, parsing from bluetooth.js ...
    // They share the same protocol, just different transport.
}
