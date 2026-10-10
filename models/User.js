const mongoose = require("mongoose");
const PassportLocalMongoose = require("passport-local-mongoose").default;
const Schema = mongoose.Schema;

const userSchema = new Schema({
    email:{
        type:String,
        required:true
    }
});

userSchema.plugin(PassportLocalMongoose);
const User = mongoose.model("User",userSchema);

module.exports = User;