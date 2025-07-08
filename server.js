const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;

const server = require('http').createServer();
const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        // Broadcast to all other clients
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });
    
    ws.on('close', () => console.log('Client disconnected'));
    ws.on('error', (error) => console.error('WebSocket error:', error));
});

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    wss.close();
    server.close();
    process.exit();
});
