const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { holdings, positions } = require("../Dashboard/src/data/data.jsx");
const HoldingModel = require("./models/HoldingsModel");
const PositionModel = require("./models/PositionsModel");
const OrderModel = require("./models/OrdersModel");

const PORT = process.env.PORT || 3002;
const url = process.env.MONGO_URL;

const bodyParser = require("body-parser");
const cors = require("cors");

const session = require("express-session");
const { MongoStore } = require("connect-mongo");

const app = express();
app.use(bodyParser.json());

const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/User.js");
const { isLoggedIn } = require("./middleware.js");

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  }),
);

const store = MongoStore.create({
  mongoUrl: url,
  crypto: {
    secret: "awadh",
  },
  touchAfter: 24 * 3600,
});

const sessionOption = {
  store,
  secret: "awadh",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

app.use(session(sessionOption));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get("/holdings", isLoggedIn, async (req, res) => {
  try{
  let allHoldings = await HoldingModel.find({owner:req.user._id});
  res.json(allHoldings);
  }
  catch(err){
    console.log(err.message);
  }
});

app.get("/positions", isLoggedIn,async (req, res) => {
  let allPositions = await PositionModel.find({});
  res.json(allPositions);
});



app.post("/newBuyOrder", isLoggedIn, async (req, res) => {
  const name = req.body.name;
  const qty = Number(req.body.qty);
  const price = Number(req.body.price);
  const owner = req.user._id;

  // 1. Validate input
  if (
    typeof name !== "string" ||
    !name.trim() ||
    !Number.isFinite(qty) ||
    !Number.isFinite(price) ||
    qty <= 0 ||
    price <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid order data"
    });
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {

      // 2. Find logged-in user's holding
      const holding = await HoldingModel.findOne({
        owner,
        name
      }).session(session);

      if (holding) {
        // 3. Update existing holding
        const totalQty = holding.qty + qty;

        holding.avg =
          (holding.avg * holding.qty + price * qty) / totalQty;

        holding.qty = totalQty;
        holding.price = price;

        await holding.save({ session });

      } else {
        // 4. Create new holding
        await HoldingModel.create(
          [{
            owner,
            name,
            qty,
            avg: price,
            price,
            net: "0%",
            day: "0%"
          }],
          { session }
        );
      }

      // 5. Create order in the same transaction
      await OrderModel.create(
        [{
          owner,
          name,
          qty,
          price,
          mode: "BUY"
        }],
        { session }
      );
    });

    // 6. Send success only after transaction commits
    return res.status(201).json({
      success: true,
      message: "Buy order placed and holding updated"
    });

  } catch (error) {
    console.error("Buy order error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to process buy order"
    });

  } finally {
    await session.endSession();
  }
});


app.post("/newSellOrder", isLoggedIn, async (req, res) => {
  const qty = Number(req.body.qty);
  const price = Number(req.body.price);
  const name = req.body.name;
  const owner = req.user._id;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    !Number.isFinite(qty) ||
    !Number.isFinite(price) ||
    qty <= 0 ||
    price <= 0
  ) {
    return res.status(400).json({
      message: "Invalid sell order data"
    });
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Atomically check quantity and reduce it
      const holding = await HoldingModel.findOneAndUpdate(
        {
          owner,
          name,
          qty: { $gte: qty }
        },
        {
          $inc: { qty: -qty }
        },
        {
          new: true,
          session
        }
      );

      if (!holding) {
        const exists = await HoldingModel.exists({
          owner,
          name
        }).session(session);

        if (!exists) {
          const error = new Error("Holding not found");
          error.statusCode = 404;
          throw error;
        }

        const error = new Error(
          "Insufficient quantity available to sell"
        );
        error.statusCode = 400;
        throw error;
      }

      // Delete holding if all shares have been sold
      if (holding.qty === 0) {
        await HoldingModel.deleteOne({
          _id: holding._id,
          owner,
          qty: 0
        }, { session });
      }

      // Save the sell order in the same transaction
      await OrderModel.create(
        [{
          owner,
          name,
          qty,
          price,
          mode: "SELL"
        }],
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      message: "Sell order successfully placed"
    });
  } catch (error) {
    console.error("Sell order error:", error.message);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode
        ? error.message
        : "Unable to process sell order"
    });
  } finally {
    await session.endSession();
  }
});

app.get("/orders", isLoggedIn, async (req, res) => {
  try{
  let orders = await OrderModel.find({owner:req.user._id});
  res.json(orders);
  }
  catch(err){
    console.log(err.message);
  }
});

app.post("/signup", async (req, res, next) => {
  try {
    let { username, email, password } = req.body;
    let newUser = new User({ username, email });
    let registerUser = await User.register(newUser, password);

    req.login(registerUser, (err) => {
      if (err) {
        return next(err);
      }
      res.status(201).json({
        success: true,
        message: "Welcome to zerodha",
        user: registerUser,
      });
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Incorrect username or password",
      });
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      return res.status(200).json({
        success: true,
        message: "Welcome to zerodha",
      });
    });
  })(req, res, next);
});


app.get("/signout", async(req,res,next)=>{
    req.logout((err) => {
      if(err){
        return next(err);
      }
      res.status(200).json({
        success:true,
        message:"You logged out successfully"
      })
    })
});

app.get("/checkAuthentication", (req, res) => {
  res.set("Cache-Control", "no-store");

  if (!req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      message: "You must be logged in first",
    });
  }

  return res.status(200).json({
    success: true,
    message: "User is authenticated",
  });
});


app.get("/getuser",(req,res) => {
    if(req.user){
      res.json({
        user:req.user
      })
    }
});

app.use((err, req, res, next) => {
  let { statusCode = 500, message = "some error occured" } = err;
  res.status(statusCode).json({
    message: message,
  });
});

mongoose
  .connect(url)
  .then(() => {
    console.log("DB connected");

    app.listen(PORT, () => {
      console.log(`App started on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("DB connection error:", err);
  });
