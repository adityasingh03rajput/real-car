const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const gameState = {
  players: {
    red: { x: 0.2, y: 0.5, dx: 0, dy: 0, ax: 0, ay: 0, health: 100, freeze: 0, shootCooldown: 0 },
    blue: { x: 0.8, y: 0.5, dx: 0, dy: 0, ax: 0, ay: 0, health: 100, freeze: 0, shootCooldown: 0 }
  },
  ball: { x: 0.5, y: 0.5, dx: 0.015, dy: -0.01, r: 0.01 },
  bullets: [],
  score: { red: 0, blue: 0 }
};

const connections = {
  game: null,
  red: null,
  blue: null
};

const logClients = new Set();
function broadcastLog(msg) {
  console.log(msg);
  for(const ws of logClients) {
    if(ws.readyState===1) ws.send(JSON.stringify({type:'log',msg}));
  }
}

// Physics constants
const FRICTION = 0.95;
const BALL_BOUNCE = 0.8;
const PLAYER_BOUNCE = 0.7;
const BULLET_SPEED = 0.012; // Decreased bullet speed
const FREEZE_TIME = 120;
const PLAYER_SPEED = 0.02;
// Add a per-player shoot cooldown
// Remove shoot cooldown
// Sensitivity constant for movement/aim
const SENSITIVITY = 1.0;

// Track super bullet usage per player
let superUsed = { red: false, blue: false };
let dynamites = [];
let dynamiteUsed = { red: false, blue: false };

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.role === 'game') {
        connections.game = ws;
        ws.send(JSON.stringify({ type: 'init', state: gameState }));
        console.log('[CONNECT] Game client connected');
        return;
      }

      if (data.role === 'mobile' && data.playerId) {
        connections[data.playerId] = ws;
        ws.playerId = data.playerId;
        ws.send(JSON.stringify({ type: 'player_assigned', playerId: data.playerId }));
        console.log(`[CONNECT] Mobile client assigned to ${data.playerId}`);
        return;
      }

      if (data.role === 'log') {
        logClients.add(ws);
        ws.on('close',()=>logClients.delete(ws));
        ws.send(JSON.stringify({type:'log',msg:'[LOG] Log client connected'}));
        return;
      }

      if (data.cmd && data.playerId) {
        const player = gameState.players[data.playerId];
        if (!player || player.health <= 0 || player.freeze > 0) return;

        switch(data.cmd) {
          case 'move':
            const rad = data.angle * Math.PI / 180;
            player.dx = Math.cos(rad) * data.power * PLAYER_SPEED * SENSITIVITY;
            player.dy = Math.sin(rad) * data.power * PLAYER_SPEED * SENSITIVITY;
            broadcastLog(`[MOVE] ${data.playerId} angle=${data.angle} power=${data.power}`);
            break;
            
          case 'aim':
            const aimRad = data.angle * Math.PI / 180;
            player.ax = Math.cos(aimRad) * SENSITIVITY;
            player.ay = Math.sin(aimRad) * SENSITIVITY;
            broadcastLog(`[AIM] ${data.playerId} angle=${data.angle}`);
            break;
            
          case 'shoot':
            let isSuper = data.super === true;
            if (isSuper && !superUsed[data.playerId]) {
              // Super bullet
              gameState.bullets.push({
                x: player.x,
                y: player.y,
                dx: player.ax * BULLET_SPEED * 1.5,
                dy: player.ay * BULLET_SPEED * 1.5,
                owner: data.playerId,
                dist: 0,
                super: true,
                color: data.playerId === 'red' ? '#fff' : '#00f'
              });
              superUsed[data.playerId] = true;
              broadcastLog(`[SHOOT] ${data.playerId} shot a SUPER bullet`);
            } else if (!isSuper) {
              // Normal bullet
              gameState.bullets.push({
                x: player.x,
                y: player.y,
                dx: player.ax * BULLET_SPEED,
                dy: player.ay * BULLET_SPEED,
                owner: data.playerId,
                dist: 0
              });
              broadcastLog(`[SHOOT] ${data.playerId} shot a bullet`);
            }
            break;
          case 'place_dynamite':
            if (dynamiteUsed[data.playerId]) break;
            let dx = data.x, dy = data.y;
            if (dx == null || dy == null) {
              dx = player.x;
              dy = player.y;
            }
            dynamites.push({ x: dx, y: dy, owner: data.playerId });
            dynamiteUsed[data.playerId] = true;
            broadcastLog(`[DYNAMITE] ${data.playerId} placed dynamite at (${dx.toFixed(2)},${dy.toFixed(2)})`);
            break;
        }
      }
    } catch (err) {
      console.error('Error:', err);
    }
  });

  ws.on('close', () => {
    if (ws === connections.game) { connections.game = null; broadcastLog('[DISCONNECT] Game client disconnected'); }
    if (ws === connections.red) { connections.red = null; broadcastLog('[DISCONNECT] Red player disconnected'); }
    if (ws === connections.blue) { connections.blue = null; broadcastLog('[DISCONNECT] Blue player disconnected'); }
    logClients.delete(ws);
  });
});

function updateGame() {
  // Update players
  Object.entries(gameState.players).forEach(([id, p]) => {
    if (p.shootCooldown > 0) p.shootCooldown--;
    if (p.freeze > 0) {
      p.freeze--;
    } else {
      // Store previous position for wall collision impact
      const prevX = p.x;
      const prevY = p.y;
      p.x += p.dx;
      p.y += p.dy;
      p.dx *= FRICTION;
      p.dy *= FRICTION;
      // Wall collision and impact
      let wallHit = false;
      let impact = 0;
      if (p.x < 0.1) {
        impact = Math.abs(p.dx);
        p.x = 0.1;
        p.dx = -p.dx * 0.5; // knockback
        wallHit = true;
      } else if (p.x > 0.9) {
        impact = Math.abs(p.dx);
        p.x = 0.9;
        p.dx = -p.dx * 0.5;
        wallHit = true;
      }
      if (p.y < 0.1) {
        impact = Math.abs(p.dy);
        p.y = 0.1;
        p.dy = -p.dy * 0.5;
        wallHit = true;
      } else if (p.y > 0.9) {
        impact = Math.abs(p.dy);
        p.y = 0.9;
        p.dy = -p.dy * 0.5;
        wallHit = true;
      }
      // If impact is significant (player was running), reduce health
      if (wallHit && impact > 0.03) {
        const damage = Math.round(impact * 200); // scale impact to damage
        p.health = Math.max(0, p.health - damage);
        if (p.health === 0) p.freeze = 120;
        broadcastLog(`[WALL] ${id} hit wall with impact ${impact.toFixed(3)}, damage ${damage}, health ${p.health}`);
        // Optionally, send wall hit event for animation (not in minimal state)
        p._wallHit = true;
      } else {
        p._wallHit = false;
      }
    }
  });

  // Spongy player-player collision
  const red = gameState.players.red;
  const blue = gameState.players.blue;
  const playerRadius = 0.04; // slightly larger than ball
  const dx = blue.x - red.x;
  const dy = blue.y - red.y;
  const dist = Math.hypot(dx, dy);
  if (dist < playerRadius * 2) {
    // Calculate overlap
    const overlap = playerRadius * 2 - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    // Push players apart
    red.x -= nx * overlap / 2;
    red.y -= ny * overlap / 2;
    blue.x += nx * overlap / 2;
    blue.y += ny * overlap / 2;
    // Exchange velocity (spongy bounce)
    const k = 0.7; // bounciness
    const v1 = red.dx * nx + red.dy * ny;
    const v2 = blue.dx * nx + blue.dy * ny;
    const m1 = 1, m2 = 1;
    const newV1 = ((m1 - k * m2) * v1 + (1 + k) * m2 * v2) / (m1 + m2);
    const newV2 = ((m2 - k * m1) * v2 + (1 + k) * m1 * v1) / (m1 + m2);
    red.dx += (newV1 - v1) * nx;
    red.dy += (newV1 - v1) * ny;
    blue.dx += (newV2 - v2) * nx;
    blue.dy += (newV2 - v2) * ny;
  }

  // Update ball
  gameState.ball.x += gameState.ball.dx;
  gameState.ball.y += gameState.ball.dy;
  
  if (gameState.ball.x < gameState.ball.r || gameState.ball.x > 1 - gameState.ball.r) {
    gameState.ball.dx *= -BALL_BOUNCE;
    gameState.ball.x = Math.max(gameState.ball.r, Math.min(1 - gameState.ball.r, gameState.ball.x));
    broadcastLog(`[BALL] Ball bounced X: x=${gameState.ball.x.toFixed(2)}, dx=${gameState.ball.dx.toFixed(3)}`);
  }
  if (gameState.ball.y < gameState.ball.r || gameState.ball.y > 1 - gameState.ball.r) {
    gameState.ball.dy *= -BALL_BOUNCE;
    gameState.ball.y = Math.max(gameState.ball.r, Math.min(1 - gameState.ball.r, gameState.ball.y));
    broadcastLog(`[BALL] Ball bounced Y: y=${gameState.ball.y.toFixed(2)}, dy=${gameState.ball.dy.toFixed(3)}`);
  }

  // Update bullets
  // Bullet-to-bullet collision and weak bullet logic
  let bullets = gameState.bullets;
  // Mark bullets for removal
  let removeIdx = new Set();
  for (let i = 0; i < bullets.length; ++i) {
    let b = bullets[i];
    // Update position and distance
    b.x += b.dx;
    b.y += b.dy;
    b.dist = (b.dist || 0) + Math.hypot(b.dx, b.dy);
    // Remove if travelled too far
    if (b.dist > 1.5) removeIdx.add(i);
    // Remove if out of bounds
    if (b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1) removeIdx.add(i);
  }
  // Bullet-to-bullet collision
  for (let i = 0; i < bullets.length; ++i) {
    for (let j = i + 1; j < bullets.length; ++j) {
      if (removeIdx.has(i) || removeIdx.has(j)) continue;
      const dx = bullets[i].x - bullets[j].x;
      const dy = bullets[i].y - bullets[j].y;
      if (Math.hypot(dx, dy) < 0.02) {
        if (bullets[i].dist > bullets[j].dist) {
          removeIdx.add(i);
        } else if (bullets[j].dist > bullets[i].dist) {
          removeIdx.add(j);
        } else {
          removeIdx.add(i);
          removeIdx.add(j);
        }
      }
    }
  }
  // Ball-bullet collision (bounce ball)
  for (let i = 0; i < bullets.length; ++i) {
    if (removeIdx.has(i)) continue;
    const b = bullets[i];
    const bdx = gameState.ball.x - b.x;
    const bdy = gameState.ball.y - b.y;
    const bdist = Math.hypot(bdx, bdy);
    if (bdist < gameState.ball.r + 0.015) {
      // Bounce ball in bullet direction
      const impact = 0.04;
      gameState.ball.dx += b.dx * impact;
      gameState.ball.dy += b.dy * impact;
      broadcastLog(`[BULLET] Ball hit by bullet from ${b.owner}`);
      removeIdx.add(i);
    }
  }
  // Bullet-player collision (knockback)
  for (let i = 0; i < bullets.length; ++i) {
    if (removeIdx.has(i)) continue;
    const b = bullets[i];
    for (const [id, p] of Object.entries(gameState.players)) {
      if (b.owner !== id && Math.abs(b.x - p.x) < 0.05 && Math.abs(b.y - p.y) < 0.1) {
        p.health -= 10;
        // Knockback
        const knockback = 0.08;
        p.dx += b.dx * knockback;
        p.dy += b.dy * knockback;
        if (b.super) {
          // Super bullet logic
          if (id === 'blue' && b.color !== '#000') {
            b.color = '#000'; // turn black if hits blue
          } else if (id === 'red' && b.color !== '#fff') {
            b.color = '#fff'; // turn white if hits red
            b.dx *= 0.5; b.dy *= 0.5; // slow down
          }
        }
        if (p.health <= 0) {
          p.freeze = 120; // 2 seconds freeze
          p.health = 0;
        } else {
          p.freeze = 30;
        }
        broadcastLog(`[HIT] ${id} hit by bullet from ${b.owner}. Health: ${p.health}`);
        if (!b.super) removeIdx.add(i); // normal bullet destroyed
      }
    }
  }
  // Remove super bullet if out of bounds or travelled too far
  for (let i = 0; i < bullets.length; ++i) {
    if (removeIdx.has(i)) continue;
    const b = bullets[i];
    if (b.super && (b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1 || b.dist > 2.5)) {
      removeIdx.add(i);
    }
  }
  // Remove marked bullets
  gameState.bullets = bullets.filter((_, idx) => !removeIdx.has(idx));

  // Player-ball collision (unchanged)
  Object.entries(gameState.players).forEach(([id, p]) => {
    if (p.freeze > 0) return;
    const dx = gameState.ball.x - p.x;
    const dy = gameState.ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < gameState.ball.r + 0.04) {
      const nx = dx/dist;
      const ny = dy/dist;
      const pVel = (p.dx * nx + p.dy * ny) * PLAYER_BOUNCE;
      const bVel = (gameState.ball.dx * nx + gameState.ball.dy * ny);
      const totalVel = pVel + bVel;
      gameState.ball.dx += (totalVel - bVel) * nx * BALL_BOUNCE;
      gameState.ball.dy += (totalVel - bVel) * ny * BALL_BOUNCE;
      broadcastLog(`[COLLISION] Ball hit by ${id}`);
    }
  });

  // Goal scoring
  // Left goal: x < 0.02, y in [0.4,0.6] (red scores)
  // Right goal: x > 0.98, y in [0.4,0.6] (blue scores)
  if (gameState.ball.x < 0.02 && gameState.ball.y > 0.4 && gameState.ball.y < 0.6) {
    gameState.score.blue += 1;
    broadcastLog(`[GOAL] Blue scores! ${gameState.score.red} - ${gameState.score.blue}`);
    resetAfterGoal();
  } else if (gameState.ball.x > 0.98 && gameState.ball.y > 0.4 && gameState.ball.y < 0.6) {
    gameState.score.red += 1;
    broadcastLog(`[GOAL] Red scores! ${gameState.score.red} - ${gameState.score.blue}`);
    resetAfterGoal();
  }

  // Dynamite explosion logic
  let dynamiteExploded = false;
  for (let i = dynamites.length - 1; i >= 0; --i) {
    const d = dynamites[i];
    let exploded = false;
    // If any player overlaps
    for (const [id, p] of Object.entries(gameState.players)) {
      const dist = Math.hypot(p.x - d.x, p.y - d.y);
      if (dist < 0.06) {
        // If ball also overlaps, count as goal
        const ballDist = Math.hypot(gameState.ball.x - d.x, gameState.ball.y - d.y);
        if (ballDist < 0.04) {
          // Goal for dynamite owner
          gameState.score = gameState.score || { red: 0, blue: 0 };
          if (d.owner === 'red') gameState.score.red = (gameState.score.red || 0) + 1;
          else if (d.owner === 'blue') gameState.score.blue = (gameState.score.blue || 0) + 1;
          broadcastLog(`[DYNAMITE GOAL] ${d.owner} scored with dynamite!`);
          dynamiteExploded = true;
          break;
        }
        // Otherwise, blast player
        p.dx += (p.x - d.x) * 0.2;
        p.dy += (p.y - d.y) * 0.2;
        p.health = Math.max(0, p.health - 30);
        if (p.health === 0) p.freeze = 120;
        broadcastLog(`[DYNAMITE] ${id} hit by dynamite from ${d.owner}`);
        exploded = true;
      }
    }
    if (exploded) {
      dynamites.splice(i, 1);
    }
  }
  if (dynamiteExploded) {
    dynamites = [];
    dynamiteUsed.red = false;
    dynamiteUsed.blue = false;
  }

  if (connections.game) {
    // Only send minimal state: player positions, ball, bullets
    const minimalState = {
      players: {
        red: { x: gameState.players.red.x, y: gameState.players.red.y, health: gameState.players.red.health },
        blue: { x: gameState.players.blue.x, y: gameState.players.blue.y, health: gameState.players.blue.health }
      },
      ball: { x: gameState.ball.x, y: gameState.ball.y },
      bullets: gameState.bullets.map(b => ({ x: b.x, y: b.y, owner: b.owner }))
    };
    connections.game.send(JSON.stringify({
      type: 'update',
      state: minimalState
    }));
  }
}

function resetAfterGoal() {
  // Reset ball and players
  gameState.ball.x = 0.5;
  gameState.ball.y = 0.5;
  gameState.ball.dx = (Math.random() - 0.5) * 0.03;
  gameState.ball.dy = (Math.random() - 0.5) * 0.03;
  gameState.players.red.x = 0.2;
  gameState.players.red.y = 0.5;
  gameState.players.red.dx = 0;
  gameState.players.red.dy = 0;
  gameState.players.red.freeze = 0;
  gameState.players.red.shootCooldown = 0;
  gameState.players.red.health = 100;
  gameState.players.blue.x = 0.8;
  gameState.players.blue.y = 0.5;
  gameState.players.blue.dx = 0;
  gameState.players.blue.dy = 0;
  gameState.players.blue.freeze = 0;
  gameState.players.blue.shootCooldown = 0;
  gameState.players.blue.health = 100;
  gameState.bullets = [];
  superUsed.red = false;
  superUsed.blue = false;
  dynamites = [];
  dynamiteUsed.red = false;
  dynamiteUsed.blue = false;
}

setInterval(updateGame, 1000/60);
console.log('Server running on ws://localhost:8080');