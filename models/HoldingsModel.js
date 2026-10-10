const mongoose = require("mongoose");

const Schema = mongoose.Schema;
const holdingSchema = new Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    name: String,
    qty: Number,
    avg: Number,
    price: Number,
    net: String,
    day: String,
});

const HoldingModel = mongoose.model("HoldingModel",holdingSchema);

module.exports = HoldingModel;