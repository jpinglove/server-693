const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true
  },
  nickname: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  // 简单的信誉评价体系
  reputation: {
    good: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    bad: { type: Number, default: 0 },
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);