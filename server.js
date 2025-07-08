const WebSocket = require('ws');
const http = require('http');
const PORT = process.env.PORT || 8080;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Track game sessions
const sessions = new Map();

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle session registration
      if (data.type === 'register') {
        const { code, role } = data;
        
        // Create new session if doesn't exist
        if (!sessions.has(code)) {
          sessions.set(code, { game: null, remote: null });
        }
        
        const session = sessions.get(code);
        
        // Register client in appropriate role
        if (role === 'game' && !session.game) {
          session.game = ws;
          console.log(`Game registered for code ${code}`);
          ws.send(JSON.stringify({ type: 'status', status: 'waiting' }));
        } 
        else if (role === 'remote' && !session.remote) {
          session.remote = ws;
          console.log(`Remote registered for code ${code}`);
          ws.send(JSON.stringify({ type: 'status', status: 'waiting' }));
        }
        
        // When both clients are connected
        if (session.game && session.remote) {
          session.game.send(JSON.stringify({ 
            type: 'status', 
            status: 'connected',
            peer: 'remote'
          }));
          session.remote.send(JSON.stringify({ 
            type: 'status', 
            status: 'connected',
            peer: 'game'
          }));
          console.log(`Session ${code} connected`);
        }
        
        return;
      }
      
      // Forward messages to the paired client
      const session = [...sessions.entries()]
        .find(([_, s]) => s.game === ws || s.remote === ws);
      
      if (session) {
        const [code, { game, remote }] = session;
        if (ws === game && remote) {
          remote.send(message);
        } 
        else if (ws === remote && game) {
          game.send(message);
        }
      }
      
    } catch (e) {
      console.error('Message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    
    // Clean up disconnected clients
    for (const [code, session] of sessions.entries()) {
      if (session.game === ws) {
        if (session.remote) {
          session.remote.send(JSON.stringify({ 
            type: 'status', 
            status: 'disconnected'
          }));
        }
        session.game = null;
        console.log(`Game disconnected from session ${code}`);
      }
      else if (session.remote === ws) {
        if (session.game) {
          session.game.send(JSON.stringify({ 
            type: 'status', 
            status: 'disconnected'
          }));
        }
        session.remote = null;
        console.log(`Remote disconnected from session ${code}`);
      }
      
      // Remove empty sessions
      if (!session.game && !session.remote) {
        sessions.delete(code);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Session server running on port ${PORT}`);
});
