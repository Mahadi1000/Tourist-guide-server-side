const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kvsufwy.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kvsufwy.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const userCollection = client.db("touristDB").collection("users");
    const packageCollection = client.db("touristDB").collection("package");
    const reviewCollection = client.db("touristDB").collection("reviews");
    const cartCollection = client.db("touristDB").collection("bookings");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });
    // middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // tourist guide after verify Token

    const verifyGuide = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isGuide = user?.role === "guide";
      if (!isGuide) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/users/guide/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let guide = false;
      if (user) {
        guide = user?.role === "guide";
      }
      res.send({ guide });
    });

    // users related api
    app.get(
      "/users",
      verifyToken,
      verifyGuide,
      verifyAdmin,
      async (req, res) => {
        const result = await userCollection.find().toArray();
        res.send(result);
      }
    );

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user doesnt exists:
      // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // packages realated api

    app.get("/packages", async (req, res) => {
      const result = await packageCollection.find().toArray();
      res.send(result);
    });
     app.get("/packages/:id", async (req, res) => {
       const id = req.params.id;
       const query = { _id: new ObjectId(id) };
       const result = await packageCollection.findOne(query);
       res.send(result);
     });
     app.post("/packages", verifyToken, verifyAdmin, async (req, res) => {
       const item = req.body;
       const result = await packageCollection.insertOne(item);
       res.send(result);
     });
     app.delete("/packages/:id", verifyToken, verifyAdmin, async (req, res) => {
       const id = req.params.id;
       const query = { _id: new ObjectId(id) };
       const result = await packageCollection.deleteOne(query);
       res.send(result);
     });


    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // carts collection
    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      try {
        const bookItem = req.body;

        // Check if the item is already booked
        const existingBooking = await cartCollection.findOne(bookItem);
        if (existingBooking) {
          return res.send({
            acknowledgment: false,
            message: "Already booked.",
          });
        }

        // If not already booked, proceed with the insertion
        const result = await cartCollection.insertOne(bookItem);
        res.send({ insertedId: result.insertedId, acknowledgment: true });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          error: "An error occurred while adding to cart.",
          acknowledgment: false,
        });
      }
    });
    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // carts collection

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Tourist guide is running");
});

app.listen(port, () => {
  console.log(`Tourist guide is running on port ${port}`);
});
