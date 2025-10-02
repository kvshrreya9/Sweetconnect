require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Fix CORS configuration
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5000"],
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Enhanced CORS configuration
app.use(cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5000"],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Database setup
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database (keep your existing database code here)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT,
    receiver_id TEXT,
    content TEXT,
    type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    activity_type TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Create default users
  const defaultUsers = [
    { id: uuidv4(), email: 'admin@example.com', password: 'admin123', name: 'Admin', role: 'admin' },
    { id: uuidv4(), email: 'shrreya@example.com', password: 'shrreya123', name: 'Shrreya', role: 'shrreya' }
  ];

  defaultUsers.forEach(user => {
    db.get('SELECT * FROM users WHERE email = ?', [user.email], (err, row) => {
      if (err) return;
      if (!row) {
        const hashedPassword = bcrypt.hashSync(user.password, 10);
        db.run('INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
          [user.id, user.email, hashedPassword, user.name, user.role]);
      }
    });
  });
});

// Mock email function for development
async function sendEmail(to, subject, text) {
  console.log('📧 EMAIL NOTIFICATION:', { to, subject, text });
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// API Routes

// User registration
app.post('/api/register', async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (row) {
        return res.status(400).json({ error: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();
      const userRole = role || 'shared';

      db.run('INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
        [userId, email, hashedPassword, name || email.split('@')[0], userRole],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create user' });
          }

          sendEmail('shrreya@example.com', 'New User Registration', 
            `A new user (${email}) has registered on SweetConnect.`);

          const token = jwt.sign({ id: userId, email, role: userRole }, JWT_SECRET);
          res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: userId, email, name: name || email.split('@')[0], role: userRole }
          });
        });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// User login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, row.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Log activity
    db.run('INSERT INTO activities (id, user_id, activity_type, details) VALUES (?, ?, ?, ?)',
      [uuidv4(), row.id, 'login', `User logged in at ${new Date().toISOString()}`]);

    // Send notification to Shrreya if user is not Shrreya
    if (row.email !== 'shrreya@example.com') {
      sendEmail('shrreya@example.com', 'User Activity', 
        `User ${row.email} logged in to SweetConnect.`);
    }

    const token = jwt.sign({ id: row.id, email: row.email, role: row.role }, JWT_SECRET);
    res.json({
      message: 'Login successful',
      token,
      user: { id: row.id, email: row.email, name: row.name, role: row.role }
    });
  });
});

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, email, name, role FROM users WHERE id = ?', [req.user.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ user: row });
  });
});

// Send message
app.post('/api/messages', authenticateToken, (req, res) => {
  const { content, type = 'message' } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  // Find Shrreya's user ID
  db.get('SELECT id FROM users WHERE role = ?', ['shrreya'], (err, shrreya) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    const messageId = uuidv4();
    db.run('INSERT INTO messages (id, sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?, ?)',
      [messageId, req.user.id, shrreya.id, content, type],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to send message' });
        }

        // Send email notification to Shrreya
        db.get('SELECT name, email FROM users WHERE id = ?', [req.user.id], (err, sender) => {
          if (!err && sender) {
            sendEmail('shrreya@example.com', 'New Message on SweetConnect',
              `You have a new message from ${sender.name} (${sender.email}):\n\n${content}`);
          }
        });

        // Emit real-time message
        io.emit('newMessage', {
          id: messageId,
          sender_id: req.user.id,
          content,
          type,
          created_at: new Date().toISOString(),
          sender_name: req.user.name || req.user.email
        });

        res.json({ message: 'Message sent successfully', id: messageId });
      });
  });
});

// Get messages for a user
app.get('/api/messages', authenticateToken, (req, res) => {
  db.all(`SELECT m.*, u.name as sender_name 
          FROM messages m 
          JOIN users u ON m.sender_id = u.id 
          WHERE m.receiver_id = ? OR m.sender_id = ? 
          ORDER BY m.created_at DESC 
          LIMIT 50`, 
          [req.user.id, req.user.id], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ messages: rows });
  });
});

// Log activity
app.post('/api/activities', authenticateToken, (req, res) => {
  const { activity_type, details } = req.body;

  if (!activity_type) {
    return res.status(400).json({ error: 'Activity type is required' });
  }

  const activityId = uuidv4();
  db.run('INSERT INTO activities (id, user_id, activity_type, details) VALUES (?, ?, ?, ?)',
    [activityId, req.user.id, activity_type, details],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to log activity' });
      }

      // Send email notification to Shrreya for important activities
      if (activity_type !== 'login' && req.user.role !== 'shrreya') {
        db.get('SELECT name, email FROM users WHERE id = ?', [req.user.id], (err, user) => {
          if (!err && user) {
            sendEmail('shrreya@example.com', 'User Activity on SweetConnect',
              `User ${user.name} (${user.email}) performed activity: ${activity_type}\n\nDetails: ${details || 'No details provided'}`);
          }
        });
      }

      res.json({ message: 'Activity logged successfully', id: activityId });
    });
});

// Socket.io for real-time communication
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId);
  });

  socket.on('sendMessage', (data) => {
    io.emit('newMessage', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve frontend for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Website: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`👤 Default logins:`);
  console.log(`   - Admin: admin@example.com / admin123`);
  console.log(`   - Shrreya: shrreya@example.com / shrreya123`);
  console.log(`   - Shared User: Any email/password (auto-registers)`);
});