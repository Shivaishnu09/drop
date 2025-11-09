// 🌤️ SkyDrop Backend (MongoDB + Express + Multer)

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3001;

// ✅ MongoDB Atlas Connection (hardcoded for simplicity)
const uri = "mongodb+srv://khudeshivam33_db_user:vpIIvOEfkLYk15Un@cluster0.jsvlcxm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('skydrop'); // Database name
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  }
}
connectDB();

// ✅ CORS setup (for Netlify frontend)
const allowedOrigins = [
  'https://skydrop-flieshare.netlify.app',
  'http://localhost:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(null, true); // allow all temporarily
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ✅ Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ✅ Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// 🔑 Helper functions
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function generatePassword() {
  return Math.random().toString(36).substring(2, 10);
}

// 🧠 Signup
app.post('/signup', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'User already exists' });

    const newUser = { email, password, username: username || email.split('@')[0] };
    await db.collection('users').insertOne(newUser);
    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 🔐 Login
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const user = await db.collection('users').findOne({ email, password });
    if (!user)
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = crypto.randomBytes(16).toString('hex');
    await db.collection('sessions').insertOne({
      token,
      user_id: user._id,
      created_at: new Date()
    });

    res.json({ message: 'Logged in successfully', token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 🚪 Logout
app.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token)
      await db.collection('sessions').deleteOne({ token });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 👤 Current user
app.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token)
      return res.status(401).json({ message: 'Unauthorized' });

    const session = await db.collection('sessions').findOne({ token });
    if (!session)
      return res.status(401).json({ message: 'Unauthorized' });

    const user = await db.collection('users').findOne({ _id: new ObjectId(session.user_id) });
    if (!user)
      return res.status(404).json({ message: 'User not found' });

    res.json(user);
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 🧩 Room Management
app.post('/rooms', async (req, res) => {
  try {
    const { host_id } = req.body;
    const newRoom = {
      room_code: generateRoomCode(),
      room_password: generatePassword(),
      host_id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000),
      is_active: true,
      participants: [host_id]
    };
    await db.collection('rooms').insertOne(newRoom);
    res.status(201).json(newRoom);
  } catch (err) {
    console.error("Room create error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/rooms/join', async (req, res) => {
  try {
    const { room_code, room_password, user_id } = req.body;
    const room = await db.collection('rooms').findOne({ room_code, room_password, is_active: true });
    if (!room)
      return res.status(404).json({ message: 'Invalid room code or password' });

    if (!room.participants.includes(user_id)) {
      await db.collection('rooms').updateOne(
        { _id: room._id },
        { $push: { participants: user_id } }
      );
    }
    res.json(room);
  } catch (err) {
    console.error("Join room error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/rooms/:id', async (req, res) => {
  try {
    const roomId = req.params.id;
    const room = await db.collection('rooms').findOne({ _id: new ObjectId(roomId) });
    if (!room)
      return res.status(404).json({ message: 'Room not found' });

    const roomFiles = await db.collection('files').find({ room_id: roomId }).toArray();
    const roomParticipants = await db.collection('users')
      .find({ _id: { $in: room.participants.map(id => new ObjectId(id)) } })
      .toArray();

    res.json({ ...room, files: roomFiles, participants: roomParticipants });
  } catch (err) {
    console.error("Get room error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 📤 File Upload
app.post('/rooms/:id/upload', upload.array('files'), async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.body.user_id;

    if (!req.files || req.files.length === 0)
      return res.status(400).json({ message: 'No files uploaded' });

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    for (const file of req.files) {
      const newFile = {
        room_id: roomId,
        sender_id: userId,
        file_name: file.originalname,
        file_size: file.size,
        file_type: file.mimetype,
        file_url: `${baseUrl}/uploads/${file.filename}`,
        sent_at: new Date().toISOString(),
      };
      await db.collection('files').insertOne(newFile);
    }

    res.status(201).json({ message: 'Files uploaded successfully' });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// 📥 Download
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  res.download(filePath, (err) => {
    if (err) res.status(404).json({ message: 'File not found' });
  });
});

// 🧩 TEST — MongoDB Connection Checker
app.get('/testdb', async (req, res) => {
  try {
    const test = await db.collection('test').insertOne({ message: 'MongoDB connected', time: new Date() });
    res.json({ success: true, message: '✅ MongoDB connected successfully!', test });
  } catch (err) {
    console.error("DB Test Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🌍 Root route
app.get('/', (req, res) => res.send('Hello from MongoDB-powered SkyDrop 🚀'));

// 🚀 Start server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
