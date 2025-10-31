const UserModel = require("../Models/UserModel");
const OtpModel = require("../Models/OtpModel");
const PostModel = require("../Models/PostModel");
const BatchModel = require("../Models/BatchModel");
const FeedBackModel = require("../Models/FeedBackform");
const nodemailer = require("nodemailer");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const crypto = require("crypto");
// ==================== SEND OTP ==================== //


// Helper: validate environment keys at startup (optional)
if (!process.env.BREVO_API_KEY) {
  console.warn("⚠️ BREVO_API_KEY is not set. OTP sending will fail until you set it.");
}
if (!process.env.SENDER_EMAIL) {
  console.warn("⚠️ SENDER_EMAIL is not set. OTP sender must be a verified Brevo sender.");
}
exports.sendOtpController = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // ✅ Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // ✅ Store OTP in DB (hashed or plain for testing)
    await OTPModel.findOneAndUpdate(
      { email },
      { otp, createdAt: Date.now() },
      { upsert: true, new: true }
    );

    // ✅ Setup Gmail SMTP transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // TLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // ✅ Send mail
    const mailOptions = {
      from: `"KIT Alumni" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP for KIT Alumni Registration",
      text: `Your OTP is ${otp}. It is valid for 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);

    console.log(`✅ OTP sent successfully to ${email}`);
    res.json({ success: true, message: "OTP sent successfully" });

  } catch (err) {
    console.error("❌ OTP Error:", err.message);
    res.status(500).json({ success: false, message: `Failed to send OTP: ${err.message}` });
  }
};
/* ===========================
   VERIFY OTP
   - Checks OtpModel, deletes on success
   =========================== */
const verifyOtpController = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and OTP required" });

    const record = await OtpModel.findOne({ email, otp });
    if (!record) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

    // optional: check expiry (10 min)
    const tenMins = 10 * 60 * 1000;
    if (new Date() - new Date(record.createdAt) > tenMins) {
      await OtpModel.deleteOne({ email });
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    await OtpModel.deleteOne({ email });
    return res.status(200).json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("❌ Verify OTP Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===========================
   REGISTER
   - Example register flow, hashes password
   =========================== */
const RegisterController = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      branch,
      admissionyear,
      lateralEntry = false,
      mobileno,
      usn,
      dob,
    } = req.body;

    if (!username || !email || !password || !branch || !admissionyear) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: "User already exists" });

    const currentYear = new Date().getFullYear();
    const courseDuration = lateralEntry ? 3 : 4;
    const role = admissionyear + courseDuration <= currentYear ? "alumni" : "student";
    const batchYear = lateralEntry ? admissionyear - 1 : admissionyear;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new UserModel({
      userimg: req.file ? req.file.path : "../uploads/default.jpg",
      username,
      email,
      password: hashedPassword,
      branch,
      admissionyear,
      batchYear,
      lateralEntry,
      role,
      mobileno,
      usn,
      dob,
    });

    const savedUser = await newUser.save();
    return res.status(201).json({ success: true, message: "User registered successfully", user: savedUser });
  } catch (err) {
    console.error("❌ Register Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ===========================
   LOGIN (example with USN or email)
   =========================== */
const LoginController = async (req, res) => {
  try {
    const { usn, email, password } = req.body;
    let user;
    if (usn) user = await UserModel.findOne({ usn: usn.toUpperCase() });
    else if (email) user = await UserModel.findOne({ email });
    else return res.status(400).json({ success: false, message: "Provide USN or email" });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
    return res.status(200).json({ success: true, message: "Login successful", token, user });
  } catch (err) {
    console.error("❌ Login Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==================== POSTS ==================== //
const PostController = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const { title, description, tags } = req.body;
    const newPost = new PostModel({
      title,
      description,
      postimg: req.file ? req.file.filename : null,
      hashtags: tags ? tags.split(",").map(tag => tag.trim()) : [],
      user: req.user.id,
    });
    await newPost.save();
    res.status(201).json({ message: "Post created successfully", post: newPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const allPostsController = async (req, res) => {
  try {
    const posts = await PostModel.find()
      .populate("user", "username email userimg")
      .populate("likes", "username")
      .exec();
    res.status(200).json({ success: true, posts });
  } catch (error) {
    console.log("Fetch Posts Error:", error);
    res.status(500).json({ success: false, message: "Error fetching posts" });
  }
};

const GetSinglePost = async (req, res) => {
  try {
    const post = await PostModel.findById(req.params.id).populate("user");
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ==================== LIKE & COMMENT ==================== //
const FetchLikes = async (req, res) => {
  try {
    const post = await PostModel.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    const userId = req.user.id;
    if (post.likes.includes(userId)) {
      post.likes = post.likes.filter(id => id.toString() !== userId);
    } else {
      post.likes.push(userId);
    }
    await post.save();
    res.json({ success: true, updatedLikes: post.likes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const FetchComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!comment?.trim()) return res.status(400).json({ success: false, message: "Comment cannot be empty" });

    const user = await UserModel.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const PERSPECTIVE_API_KEY = process.env.PERSPECTIVE_API_KEY;
    let toxicity = 0;
    try {
      const analyzeRes = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_API_KEY}`,
        { comment: { text: comment }, languages: ["en"], requestedAttributes: { TOXICITY: {} } }
      );
      toxicity = analyzeRes.data.attributeScores.TOXICITY.summaryScore.value;
    } catch {
      toxicity = 0;
    }
    if (toxicity > 0.6)
      return res.status(400).json({ success: false, message: "Comment rejected due to inappropriate language." });

    const post = await PostModel.findById(id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.comments.push({ text: comment.trim(), user: userId, username: user.username, createdAt: new Date() });
    await post.save();
    res.json({ success: true, updatedComments: post.comments });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ==================== PROFILE ==================== //
const getUserProfile = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await UserModel.findById(userId).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const posts = await PostModel.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("user", "username userimg");
    res.status(200).json({ success: true, user, posts });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getUserConnections = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId)
      return res.status(400).json({ success: false, message: "User ID missing" });

    const user = await UserModel.findById(userId).select("-password");
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const connections = await UserModel.find({
      _id: { $in: user.connections || [] },
    }).select("username userimg email usn");

    res.status(200).json({ success: true, user, connections });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const GetUser = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id).select("-password");
    res.status(200).json({ success: true, user });
  } catch {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==================== FEEDBACK ==================== //
const FeedbackController = async (req, res) => {
  try {
    const newFeedback = new FeedBackModel({
      username: req.user.id,
      feedback: req.body.feedback,
    });

    await newFeedback.save();
    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==================== EXPORTS ==================== //
module.exports = {
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
};
