const UserModel = require("../Models/UserModel");
const Request = require("../Models/RequestModel");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ✅ Send connection request (email with token)
exports.sendRequestController = async (req, res) => {
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user._id;

    if (fromUserId.toString() === toUserId.toString()) {
      return res.status(400).json({ success: false, message: "You cannot connect with yourself" });
    }

    // ✅ Check if request already exists
    const existingRequest = await Request.findOne({
      from: fromUserId,
      to: toUserId,
      status: { $in: ["pending", "connected"] },
    });
    if (existingRequest) {
      return res.status(400).json({ success: false, message: "Request already sent or already connected" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    const newRequest = new Request({
      from: fromUserId,
      to: toUserId,
      token,
    });
    await newRequest.save();

    const toUser = await UserModel.findById(toUserId);
    const fromUser = await UserModel.findById(fromUserId);

    // ✅ Setup Nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const acceptLink = `${process.env.BACKEND_URL}/api/student/accept-request/${token}`;
    const rejectLink = `${process.env.BACKEND_URL}/api/student/reject-request/${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: toUser.email,
      subject: `Connection Request from ${fromUser.username}`,
      html: `
        <p>Hi ${toUser.username},</p>
        <p>${fromUser.username} has sent you a connection request.</p>
        <p>
          <a href="${acceptLink}" target="_blank" style="color:green;">Accept</a> | 
          <a href="${rejectLink}" target="_blank" style="color:red;">Reject</a>
        </p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: "Request sent successfully and email delivered" });
  } catch (error) {
    console.error("❌ sendRequestController Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Accept connection request
exports.acceptRequestController = async (req, res) => {
  try {
    const { token } = req.params;
    const request = await Request.findOne({ token }).populate("from to");

    if (!request) return res.status(400).send("Invalid or expired request link");

    request.status = "connected";
    await request.save();

    await UserModel.findByIdAndUpdate(request.from._id, { $addToSet: { connections: request.to._id } });
    await UserModel.findByIdAndUpdate(request.to._id, { $addToSet: { connections: request.from._id } });

    res.send("✅ Connection accepted successfully!");
  } catch (error) {
    console.error("❌ acceptRequestController Error:", error);
    res.status(500).send("Server error");
  }
};

// ✅ Reject connection request
exports.rejectRequestController = async (req, res) => {
  try {
    const { token } = req.params;
    const request = await Request.findOne({ token });

    if (!request) return res.status(400).send("Invalid or expired request link");

    request.status = "rejected";
    await request.save();

    res.send("❌ Connection request rejected.");
  } catch (error) {
    console.error("❌ rejectRequestController Error:", error);
    res.status(500).send("Server error");
  }
};

// ✅ Get all students (excluding current user)
exports.GetStudentBatchController = async (req, res) => {
  try {
    const students = await UserModel.find({ _id: { $ne: req.user._id } })
      .select("username email branch batchYear role connections");
    res.status(200).json({ success: true, students });
  } catch (error) {
    console.error("❌ GetStudentBatchController Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ Disconnect controller
exports.disconnectController = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const currentUserId = req.user._id;

    // Remove from both users' connections
    await UserModel.findByIdAndUpdate(currentUserId, { $pull: { connections: targetUserId } });
    await UserModel.findByIdAndUpdate(targetUserId, { $pull: { connections: currentUserId } });

    // Update Request status
    await Request.findOneAndUpdate(
      { $or: [{ from: currentUserId, to: targetUserId }, { from: targetUserId, to: currentUserId }] },
      { status: "not connected" }
    );

    res.status(200).json({ success: true, message: "Disconnected successfully" });
  } catch (error) {
    console.error("❌ disconnectController Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
