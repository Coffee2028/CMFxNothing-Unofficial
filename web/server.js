
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Host Static Files
app.use(express.static('.'));

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n-----------------------------------------`);
    console.log(` NOTHING EAR CONTROLLER (SERVER)`);
    console.log(`-----------------------------------------`);
    console.log(`> App running at: http://localhost:${PORT}`);
    console.log(`> Waiting for connections...`);
    console.log(`-----------------------------------------\n`);
});
