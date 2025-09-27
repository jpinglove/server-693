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
  
  // 商品状态字段，默认为 'selling'
  status: {
    type: String,
    enum: ['selling', 'sold'], // 只能是这两个值之一
    default: 'selling'
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

