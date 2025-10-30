const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const ChatModel = require("./Models/ChatModel");
const UserModel = require("./Models/UserModel");

dotenv.config();

const app = express();
app.use(express.json());

// ✅ Allowed origins (put this BEFORE using it anywhere)
const allowedOrigins = [
  "https://vocal-biscochitos-67aba0.netlify.app",
  "http://localhost:3000",
  "http://localhost:5001",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ Handle preflight for all routes properly
app.options("*", cors());

 
// ✅ Serve uploads folder
app.use("/uploads", express.static("uploads"));

// ✅ MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Routes
app.use("/api/user", require("./Routes/UserRoutes"));
app.use("/api/account", require("./Routes/AccountRoutes"));
app.use("/api/student", require("./Routes/StudentRoutes"));
app.use("/api/alumni", require("./Routes/AlumniRoutes"));
app.use("/api/chat", require("./Routes/ChatRoutes"));
app.use("/api/admin", require("./Routes/AdminRoutes"));
app.use("/api/search", require("./Routes/SearchRoutes"));
app.use("/api/auth", require("./Routes/ForgotRoutes"));

// ✅ Health check
app.get("/", (req, res) => {
  res.send("✅ KIT Alumni backend is running fine");
});

// ✅ SOCKET.IO setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowEIO3: true,
});

const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("⚡ User connected:", socket.id);

  socket.on("user-online", async (userId) => {
    if (!userId) return;
    onlineUsers.set(userId, socket.id);
    console.log(`🟢 ${userId} is online`);
    try {
      await UserModel.findByIdAndUpdate(userId, { isOnline: true });
      io.emit("userStatusUpdate", { userId, isOnline: true });
    } catch (err) {
      console.error("Error updating online status:", err);
    }
  });

  socket.on("send-message", async ({ fromUserId, toUserId, message }) => {
    try {
      const newChat = await ChatModel.create({
        sender: fromUserId,
        receiver: toUserId,
        message,
      });

      const receiverSocket = onlineUsers.get(toUserId);
      if (receiverSocket) {
        io.to(receiverSocket).emit("receive-message", { chat: newChat });
      }

      socket.emit("message-sent", { chat: newChat });
    } catch (err) {
      console.error("Message error:", err);
    }
  });

  socket.on("disconnect", async () => {
    let disconnectedUserId = null;
    for (let [userId, sockId] of onlineUsers.entries()) {
      if (sockId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        console.log(`🔴 ${userId} went offline`);
        break;
      }
    }
    if (disconnectedUserId) {
      try {
        await UserModel.findByIdAndUpdate(disconnectedUserId, { isOnline: false });
        io.emit("userStatusUpdate", { userId: disconnectedUserId, isOnline: false });
      } catch (err) {
        console.error("Error updating offline status:", err);
      }
    }
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
