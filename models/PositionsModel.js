const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const positionSchema  = new Schema({
    product: String,
    name: String,
    qty: Number,
    avg: Number,
    price: Number,
    net: String,
    day: String,
    isLoss: {
        type:Boolean,
        default:true,
    },
});

const PositionModel = mongoose.model("PositionModel",positionSchema);
module.exports = PositionModel;