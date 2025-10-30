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

const allowedOrigins = [
  process.env.FRONTEND_URL, 
  "http://localhost:3000",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use("/uploads", express.static("uploads"));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.use("/api/user", require("./Routes/UserRoutes"));
app.use("/api/account", require("./Routes/AccountRoutes"));
app.use("/api/student", require("./Routes/StudentRoutes"));
app.use("/api/alumni", require("./Routes/AlumniRoutes"));
app.use("/api/chat", require("./Routes/ChatRoutes"));
app.use("/api/admin", require("./Routes/AdminRoutes"));
app.use("/api/search", require("./Routes/SearchRoutes"));
app.use("/api/auth", require("./Routes/ForgotRoutes"));

app.get("/", (req, res) => {
  res.send("✅ KIT Alumni backend is running fine");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
});

server.listen(process.env.PORT || 5000, () =>
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`)
);
