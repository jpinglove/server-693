const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  
  // 新增：用于存储图片的对象
  image: {
    data: Buffer, // 用于存储图片的二进制数据
    contentType: String // 用于存储图片的MIME类型, e.g., 'image/png'
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nickname: String,
    content: String,
    createdAt: { type: Date, default: Date.now }
  }],
  favoritedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);

