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

// Fix for Socket.io CORS
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Database setup
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database
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

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Enhanced email function with better error handling
async function sendEmail(to, subject, text, html = null) {
  try {
    const mailOptions = {
      from: `"SweetConnect" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      text: text,
      html: html || text.replace(/\n/g, '<br>')
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully to:', to);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Email sending failed to', to, ':', error.message);
    return { success: false, error: error.message };
  }
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

// Routes

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Check if user already exists
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (row) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();
      let userRole = role || 'shared';
      let userName = name || email.split('@')[0];

      // If it's a shared user, set name to Tharun
      if (userRole === 'shared') {
        userName = 'Tharun';
      }

      db.run('INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
        [userId, email, hashedPassword, userName, userRole],
        async function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create user' });
          }

          // Send welcome email to the new user
          const welcomeSubject = 'Welcome to SweetConnect!';
          const welcomeText = `Hello ${userName}!

Welcome to SweetConnect! Your account has been successfully created.

Account Details:
- Name: ${userName}
- Email: ${email}
- Role: ${userRole}

You can now login to SweetConnect and start using all the features.

Best regards,
SweetConnect Team`;

          const welcomeHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #FF9E64; text-align: center;">Welcome to SweetConnect! 🎉</h2>
              <div style="background: #FFF5E1; padding: 20px; border-radius: 10px; border-left: 4px solid #FFD166;">
                <h3>Hello ${userName}!</h3>
                <p>Your account has been successfully created.</p>
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <h4>Account Details:</h4>
                  <p><strong>Name:</strong> ${userName}</p>
                  <p><strong>Email:</strong> ${email}</p>
                  <p><strong>Role:</strong> ${userRole}</p>
                </div>
                <p>You can now login to SweetConnect and start using all the features.</p>
                <a href="http://localhost:3000" style="display: inline-block; background: linear-gradient(90deg, #FF9E64, #EF5B5B); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Go to SweetConnect</a>
              </div>
              <p style="text-align: center; color: #666; margin-top: 20px;">
                Best regards,<br>SweetConnect Team
              </p>
            </div>
          `;

          await sendEmail(email, welcomeSubject, welcomeText, welcomeHtml);

          // Send notification to Shrreya about new registration
          const notificationSubject = 'New User Registration on SweetConnect';
          const notificationText = `A new user has registered on SweetConnect:

User Details:
- Name: ${userName}
- Email: ${email}
- Role: ${userRole}
- Registered at: ${new Date().toLocaleString()}

Please welcome them to the platform!`;

          await sendEmail('shrreya@example.com', notificationSubject, notificationText);

          const token = jwt.sign({ id: userId, email, role: userRole }, JWT_SECRET);
          res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: userId, email, name: userName, role: userRole }
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

    // Send login notification email to the user
    const loginSubject = 'Login Alert - SweetConnect';
    const loginText = `Hello ${row.name}!

You have successfully logged into your SweetConnect account.

Login Details:
- Time: ${new Date().toLocaleString()}
- Email: ${email}

If this wasn't you, please contact support immediately.

Best regards,
SweetConnect Team`;

    await sendEmail(email, loginSubject, loginText);

    // Send notification to Shrreya if user is not Shrreya
    if (row.email !== 'shrreya@example.com') {
      const shrreyaSubject = 'User Login Activity - SweetConnect';
      const shrreyaText = `User ${row.name} (${row.email}) has logged into SweetConnect.

Login Time: ${new Date().toLocaleString()}`;

      await sendEmail('shrreya@example.com', shrreyaSubject, shrreyaText);
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

  // Find the receiver - if sender is Tharun, receiver is Shrreya, and vice versa
  const getReceiver = (senderRole) => {
    return senderRole === 'shared' ? 'shrreya' : 'shared';
  };

  const receiverRole = getReceiver(req.user.role);

  db.get('SELECT id, email, name FROM users WHERE role = ?', [receiverRole], async (err, receiver) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!receiver) {
      return res.status(400).json({ error: 'Receiver not found' });
    }

    // Get sender details
    db.get('SELECT email, name FROM users WHERE id = ?', [req.user.id], async (err, sender) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      const messageId = uuidv4();
      db.run('INSERT INTO messages (id, sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?, ?)',
        [messageId, req.user.id, receiver.id, content, type],
        async function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to send message' });
          }

          const senderName = sender.name || sender.email;
          const receiverName = receiver.name || receiver.email;

          // Send email notification to the receiver
          const receiverSubject = `New Message from ${senderName} - SweetConnect`;
          const receiverText = `Hello ${receiverName}!

You have received a new message from ${senderName} (${sender.email}):

"${content}"

Please login to SweetConnect to view and respond to this message.

Best regards,
SweetConnect Team`;

          const receiverHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #FF9E64; text-align: center;">New Message on SweetConnect 💌</h2>
              <div style="background: #FFF5E1; padding: 20px; border-radius: 10px; border-left: 4px solid #FFD166;">
                <h3>Hello ${receiverName}!</h3>
                <p>You have received a new message from <strong>${senderName}</strong> (${sender.email}):</p>
                <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 2px solid #FFD166;">
                  <p style="font-style: italic; margin: 0;">"${content}"</p>
                </div>
                <p>Please login to SweetConnect to view and respond to this message.</p>
                <a href="http://localhost:3000" style="display: inline-block; background: linear-gradient(90deg, #FF9E64, #EF5B5B); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reply on SweetConnect</a>
              </div>
              <p style="text-align: center; color: #666; margin-top: 20px;">
                Best regards,<br>SweetConnect Team
              </p>
            </div>
          `;

          await sendEmail(receiver.email, receiverSubject, receiverText, receiverHtml);

          // Send confirmation email to sender
          const senderSubject = `Message Sent to ${receiverName} - SweetConnect`;
          const senderText = `Hello ${senderName}!

Your message has been successfully delivered to ${receiverName}.

Your message:
"${content}"

${receiverName} will be notified and can respond to you on SweetConnect.

Best regards,
SweetConnect Team`;

          await sendEmail(sender.email, senderSubject, senderText);

          // Emit real-time message
          io.emit('newMessage', {
            id: messageId,
            sender_id: req.user.id,
            receiver_id: receiver.id,
            content,
            type,
            created_at: new Date().toISOString(),
            sender_name: sender.name || sender.email
          });

          res.json({ 
            message: 'Message sent successfully', 
            id: messageId,
            receiver_email: receiver.email
          });
        });
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
    async function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to log activity' });
      }

      // Get user details for email
      db.get('SELECT email, name FROM users WHERE id = ?', [req.user.id], async (err, user) => {
        if (!err && user) {
          // Send activity notification email to the user
          const activitySubject = `Activity Completed - ${activity_type} - SweetConnect`;
          const activityText = `Hello ${user.name}!

Your activity "${activity_type}" has been recorded on SweetConnect.

Details: ${details || 'No additional details provided'}

Activity completed at: ${new Date().toLocaleString()}

Thank you for using SweetConnect!

Best regards,
SweetConnect Team`;

          await sendEmail(user.email, activitySubject, activityText);

          // Send notification to Shrreya for important activities
          if (activity_type !== 'login' && req.user.role !== 'shrreya') {
            const shrreyaSubject = `User Activity - ${activity_type} - SweetConnect`;
            const shrreyaText = `User ${user.name} (${user.email}) performed activity: ${activity_type}

Details: ${details || 'No details provided'}

Activity time: ${new Date().toLocaleString()}`;

            await sendEmail('shrreya@example.com', shrreyaSubject, shrreyaText);
          }
        }
      });

      res.json({ message: 'Activity logged successfully', id: activityId });
    });
});

// Get all users (for admin)
app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  db.all('SELECT id, email, name, role, created_at FROM users', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ users: rows });
  });
});

// Socket.io for real-time communication
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log('User joined room:', userId);
  });

  socket.on('sendMessage', (data) => {
    io.emit('newMessage', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend: http://localhost:3000`);
  console.log(`🔗 Backend API: http://localhost:${PORT}`);
  console.log(`📧 Email notifications: ${process.env.EMAIL_USER ? 'ENABLED' : 'CONFIGURATION NEEDED'}`);
  console.log(`👤 Default logins:`);
  console.log(`   - Admin: admin@example.com / admin123`);
  console.log(`   - Shrreya: shrreya@example.com / shrreya123`);
  console.log(`   - Shared User: Any email/password (will show as Tharun)`);
  console.log(`\n📧 Email Flow:`);
  console.log(`   - Registration: Welcome email to new user + notification to Shrreya`);
  console.log(`   - Login: Login alert to user + notification to Shrreya`);
  console.log(`   - Messages: Email to receiver + confirmation to sender`);
  console.log(`   - Activities: Notification to user + important ones to Shrreya`);
});