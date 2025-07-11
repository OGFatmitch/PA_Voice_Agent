const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

// Load .env file manually to override shell environment variables
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    
    envLines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').trim();
                // Override any existing environment variable
                process.env[key.trim()] = value;
            }
        }
    });
}

const voiceRoutes = require('./routes/voiceRoutes');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/voice', voiceRoutes);

// --- WebSocket Server for Agent Logs ---
const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcastAgentLog(log) {
    const msg = typeof log === 'string' ? { type: 'log', message: log } : log;
    const data = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'info', message: 'Connected to agent log stream.' }));
});

// Export for use in agent process
module.exports.sendAgentLog = broadcastAgentLog;

// Serve the demo interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Demo interface available at http://localhost:${PORT}`);
}); 