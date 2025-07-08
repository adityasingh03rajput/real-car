const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server running on ws://localhost:8080');

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
    process.exit();
});
