const WebSocket = require('ws');
const http = require('http');
const PORT = process.env.PORT || 8080;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Track connected clients
const clients = {
  game: null,
  remote: null
};

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Identify client type
      if (data.type === 'register') {
        if (data.role === 'game' && !clients.game) {
          clients.game = ws;
          console.log('Game client registered');
        } 
        else if (data.role === 'remote' && !clients.remote) {
          clients.remote = ws;
          console.log('Remote client registered');
        }
        
        // Notify both clients when paired
        if (clients.game && clients.remote) {
          clients.game.send(JSON.stringify({ type: 'status', connected: true }));
          clients.remote.send(JSON.stringify({ type: 'status', connected: true }));
        }
        return;
      }
      
      // Route messages between paired clients
      if (ws === clients.game && clients.remote) {
        clients.remote.send(message);
      } 
      else if (ws === clients.remote && clients.game) {
        clients.game.send(message);
      }
      
    } catch (e) {
      console.error('Message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (ws === clients.game) {
      clients.game = null;
      if (clients.remote) {
        clients.remote.send(JSON.stringify({ type: 'status', connected: false }));
      }
    }
    if (ws === clients.remote) {
      clients.remote = null;
      if (clients.game) {
        clients.game.send(JSON.stringify({ type: 'status', connected: false }));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
