const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/authMiddleware");
const upload = require("../multerconfig");
const GalleryModel = require("../Models/GallaryModel");

const {
  RegisterController,
  sendOtpController,
  verifyOtpController,
  LoginController,
  PostController,
  allPostsController,
  GetSinglePost,
  FetchLikes,
  FetchComments,
  getUserProfile,
  getUserConnections,
  GetUser,
  FeedbackController,
} = require("../Controllers/userController");

// ==================== AUTH ==================== //
router.post("/send-otp", sendOtpController);
router.post("/verify-otp", verifyOtpController);
router.post("/register", upload.single("userimg"), RegisterController);
router.post("/login", LoginController);

// ==================== POSTS ==================== //
router.post("/posts", verifyToken, upload.single("postimg"), PostController);
router.get("/allposts", allPostsController);
router.get("/post/:id", GetSinglePost);

// ==================== LIKES & COMMENTS ==================== //
router.post("/like/:id", verifyToken, FetchLikes);
router.post("/comment/:id", verifyToken, FetchComments);

// ==================== USER CONNECTIONS ==================== //
router.get("/connections/:id", verifyToken, getUserConnections);

// ==================== PROFILE ==================== //
router.get("/", verifyToken, GetUser);

// ==================== GALLERY ==================== //
router.get("/gallery", async (req, res) => {
  try {
    const gallery = await GalleryModel.find().sort({ createdAt: -1 });
    res.json({ success: true, gallery });
  } catch (err) {
    console.error("❌ Gallery fetch error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/gallery/:id", async (req, res) => {
  try {
    const item = await GalleryModel.findById(req.params.id);
    if (!item)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, item });
  } catch (err) {
    console.error("❌ Gallery item error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== FEEDBACK ==================== //
router.post("/submit", verifyToken, FeedbackController);

// KEEP THIS LAST — to avoid conflicts with /register, /login, etc.
router.get("/profile/:id", getUserProfile);

module.exports = router;
