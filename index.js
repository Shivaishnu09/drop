const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

// ✅ Allowed frontend origins
const allowedOrigins = [
  'https://690e15d42ec572957558e69a--skydrop-project.netlify.app', // Netlify preview build
  'https://skydrop-project.netlify.app', // final Netlify domain
  'http://localhost:5173' // local dev
];

// ✅ CORS setup (proper fix)
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ✅ Ensure uploads directory exists (Render-safe path)
const uploadsDir = path.join('/tmp', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory at', uploadsDir);
  } catch (err) {
    console.error('❌ Failed to create uploads directory:', err);
  }
}
app.use('/uploads', express.static(uploadsDir));

// File-based store
const usersFilePath = path.join(__dirname, 'users.json');
let users = [];
if (fs.existsSync(usersFilePath)) {
  users = JSON.parse(fs.readFileSync(usersFilePath));
}

const rooms = [];
const files = [];
const sessions = {};

// ✅ Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Utility functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function generatePassword() {
  return Math.random().toString(36).substring(2, 10);
}

// 🧠 Signup
app.post('/signup', (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const userExists = users.find(user => user.email === email);
  if (userExists) {
    return res.status(400).json({ message: 'User already exists' });
  }
  const newUser = { id: users.length + 1, email, password, username: username || email.split('@')[0] };
  users.push(newUser);
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
  res.status(201).json({ message: 'User created successfully' });
});

// 🧠 Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  const user = users.find(user => user.email === email && user.password === password);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = crypto.randomBytes(16).toString('hex');
  sessions[token] = user.id;
  res.json({ message: 'Logged in successfully', token, user });
});

// 🧠 Logout
app.post('/logout', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token && sessions[token]) {
    delete sessions[token];
  }
  res.json({ message: 'Logged out successfully' });
});

// 🧠 Current user
app.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token && sessions[token]) {
    const userId = sessions[token];
    const user = users.find(u => u.id === userId);
    if (user) {
      return res.json(user);
    }
  }
  res.status(401).json({ message: 'Unauthorized' });
});

// 🧠 Create Room
app.post('/rooms', (req, res) => {
  const { host_id } = req.body;
  const newRoom = {
    id: rooms.length + 1,
    room_code: generateRoomCode(),
    room_password: generatePassword(),
    host_id,
    expires_at: new Date(Date.now() + 30 * 60 * 1000),
    is_active: true,
    participants: [host_id]
  };
  rooms.push(newRoom);
  res.status(201).json(newRoom);
});

// 🧠 Join Room
app.post('/rooms/join', (req, res) => {
  const { room_code, room_password, user_id } = req.body;
  const room = rooms.find(r => r.room_code === room_code && r.room_password === room_password && r.is_active);
  if (!room) {
    return res.status(404).json({ message: 'Invalid room code or password' });
  }
  if (!room.participants.includes(user_id)) {
    room.participants.push(user_id);
  }
  res.json(room);
});

// 🧠 Get Room Info
app.get('/rooms/:id', (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  const room = rooms.find(r => r.id === roomId);
  if (!room) {
    return res.status(404).json({ message: 'Room not found' });
  }
  const roomFiles = files.filter(f => f.room_id === roomId);
  const roomParticipants = users.filter(u => room.participants.includes(u.id));
  res.json({ ...room, files: roomFiles, participants: roomParticipants });
});

// 🧠 Upload Files
app.post('/rooms/:id/upload', upload.array('files'), (req, res) => {
  const roomId = parseInt(req.params.id, 10);
  const userId = parseInt(req.body.user_id, 10);

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded' });
  }

  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

  req.files.forEach(file => {
    const newFile = {
      id: files.length + 1,
      room_id: roomId,
      sender_id: userId,
      file_name: file.originalname,
      file_size: file.size,
      file_type: file.mimetype,
      file_url: `${baseUrl}/uploads/${file.filename}`,
      sent_at: new Date().toISOString(),
    };
    files.push(newFile);
  });

  res.status(201).json({ message: 'Files uploaded successfully' });
});

// 🧠 File Download
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  res.download(filePath, (err) => {
    if (err) {
      res.status(404).json({ message: 'File not found' });
    }
  });
});

// Root
app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.listen(port, () => {
  console.log(`🚀 Backend server listening on port ${port}`);
});
