// 🌤️ SkyDrop Backend (MongoDB + Supabase Storage + Express)

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3001;

// ✅ MongoDB Atlas Connection
const uri = "mongodb+srv://khudeshivam33_db_user:vpIIvOEfkLYk15Un@cluster0.xue4pfv.mongodb.net/skydrop?retryWrites=true&w=majority";
const client = new MongoClient(uri);
let db;

// ✅ Supabase Config
const SUPABASE_URL = "https://slritsxdyrcktzyjjrau.supabase.co"; // ⬅️ replace with your real URL
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNscml0c3hkeXJja3R6eWpqcmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NjY2OTYsImV4cCI6MjA3ODI0MjY5Nn0.rAaZGg_6Ws5avTBqV7p0DqSn50DLLkVpIOT656HCVpg";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ Connect MongoDB
async function connectDB() {
  try {
    await client.connect();
    db = client.db("skydrop");
    console.log("✅ Connected to MongoDB Atlas");

    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}
connectDB();

// ✅ CORS setup
app.use(cors({
  origin: ["https://skydrop-flieshare.netlify.app", "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ✅ Multer setup (temporary local)
const upload = multer({ dest: "temp_uploads/", limits: { fileSize: 50 * 1024 * 1024 } });

// 🔑 Helper functions
const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generatePassword = () => Math.random().toString(36).substring(2, 10);

// 🧠 Signup
app.post("/signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    await db.collection("users").insertOne({
      email,
      password,
      username: username || email.split("@")[0],
    });

    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 🔐 Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.collection("users").findOne({ email, password });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const token = crypto.randomBytes(16).toString("hex");
    await db.collection("sessions").insertOne({ token, user_id: user._id, created_at: new Date() });

    res.json({ message: "Logged in successfully", token, user });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 🚪 Logout
app.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (token) await db.collection("sessions").deleteOne({ token });
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// 👤 Current user
app.get("/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const session = await db.collection("sessions").findOne({ token });
    if (!session) return res.status(401).json({ message: "Unauthorized" });

    const user = await db.collection("users").findOne({ _id: new ObjectId(session.user_id) });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// 🧩 Room Management
app.post("/rooms", async (req, res) => {
  try {
    const { host_id } = req.body;
    const newRoom = {
      room_code: generateRoomCode(),
      room_password: generatePassword(),
      host_id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000),
      is_active: true,
      participants: [host_id],
    };
    await db.collection("rooms").insertOne(newRoom);
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// 📤 Supabase Upload
app.post("/rooms/:id/upload", upload.array("files"), async (req, res) => {
  try {
    const roomId = req.params.id;
    const userId = req.body.user_id;
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ message: "No files uploaded" });

    let uploadedFiles = [];

    for (const file of req.files) {
      const filePath = path.join(__dirname, file.path);
      const supabaseFileName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;

      const { data, error } = await supabase.storage
        .from("uploads")
        .upload(supabaseFileName, fs.createReadStream(filePath), {
          cacheControl: "3600",
          upsert: false,
          contentType: file.mimetype,
        });

      fs.unlinkSync(filePath); // remove temp file

      if (error) throw error;

      const { data: publicUrl } = supabase.storage.from("uploads").getPublicUrl(supabaseFileName);

      const newFile = {
        room_id: roomId,
        sender_id: userId,
        file_name: file.originalname,
        file_size: file.size,
        file_type: file.mimetype,
        file_url: publicUrl.publicUrl,
        sent_at: new Date().toISOString(),
      };

      await db.collection("files").insertOne(newFile);
      uploadedFiles.push(newFile);
    }

    res.status(201).json({ message: "Files uploaded to Supabase!", files: uploadedFiles });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: err.message });
  }
});

// 🌍 Root
app.get("/", (req, res) => res.send("☁️ SkyDrop with Supabase Storage + MongoDB is live!"));
