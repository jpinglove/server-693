const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
    },
    nickname: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    // 简单的信誉评价体系
    reputation: {
      good: { type: Number, default: 0 },
      neutral: { type: Number, default: 0 },
      bad: { type: Number, default: 0 },
    },
    viewHistory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
