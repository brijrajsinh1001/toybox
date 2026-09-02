// ═══════════════════════════════════════════════════════
//  toybox-backend/socket.js
//  Real-time notifications with Socket.io
//  Setup: npm install socket.io
// ═══════════════════════════════════════════════════════

const { Server } = require('socket.io');

// Track connected sockets by role + userId
const buyers  = new Map(); // buyerId  → socketId
const sellers = new Map(); // sellerId → socketId

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET','POST'] },
  });

  io.on('connection', socket => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Buyer registers their room after login
    // Frontend: socket.emit('buyer:join', { buyerId })
    socket.on('buyer:join', ({ buyerId }) => {
      buyers.set(Number(buyerId), socket.id);
      socket.join(`buyer_${buyerId}`);
      console.log(`👤 Buyer ${buyerId} online`);
    });

    // Seller registers their room after login
    // Frontend: socket.emit('seller:join', { sellerId })
    socket.on('seller:join', ({ sellerId }) => {
      sellers.set(Number(sellerId), socket.id);
      socket.join(`seller_${sellerId}`);
      console.log(`🏪 Seller ${sellerId} online`);
    });

    socket.on('disconnect', () => {
      for (const [id, sid] of buyers.entries())  { if(sid===socket.id){ buyers.delete(id);  break; } }
      for (const [id, sid] of sellers.entries()) { if(sid===socket.id){ sellers.delete(id); break; } }
    });
  });

  return io;
}

// ── NOTIFY HELPERS ── call these from route handlers ──

// Send notification to a specific buyer
function notifyBuyer(io, buyerId, event, payload) {
  io.to(`buyer_${buyerId}`).emit(event, payload);
}

// Send notification to a specific seller
function notifySeller(io, sellerId, event, payload) {
  io.to(`seller_${sellerId}`).emit(event, payload);
}

module.exports = { initSocket, notifyBuyer, notifySeller };
