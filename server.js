const WebSocket = require('ws');

const wss = new WebSocket.Server({ host: '192.168.102.31', port: 8080 });
let laptopSocket = null;
let mobileSocket = null;

console.log('🟢 Server started at ws://192.168.102.31:8080');

wss.on('connection', function connection(ws, req) {
  const ip = req.socket.remoteAddress;
  console.log(`📡 New connection from ${ip}`);

  ws.on('message', function incoming(message) {
    try {
      const data = JSON.parse(message);

      if (data.role === 'laptop') {
        laptopSocket = ws;
        console.log(`🖥️ Laptop connected from ${ip}`);
      }

      if (data.role === 'mobile') {
        mobileSocket = ws;
        console.log(`📱 Mobile connected from ${ip}`);
      }

      // Log and forward direction
      if (data.role === 'mobile' && data.angle !== undefined) {
        console.log(`➡️ Input from Mobile: angle=${data.angle}, power=${data.power}`);
        if (laptopSocket && laptopSocket.readyState === WebSocket.OPEN) {
          laptopSocket.send(JSON.stringify({ angle: data.angle, power: data.power }));
        }
      }
    } catch (err) {
      console.error('❌ Message Error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`❌ Disconnected: ${ip}`);
  });
});
