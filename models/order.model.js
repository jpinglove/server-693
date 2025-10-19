const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // 简化模型，假设交易在线下完成，所以没有买家信息
    // 也可以后续扩展增加 buyer 字段
    transactionDate: {
      type: Date,
      default: Date.now,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
