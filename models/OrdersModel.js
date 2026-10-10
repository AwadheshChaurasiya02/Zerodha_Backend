const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const orderSchema = new Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    name: String,
    qty: Number,
    price: Number,
    mode: String,
});

const OrderModel = mongoose.model("OrderModel",orderSchema);
module.exports = OrderModel;
