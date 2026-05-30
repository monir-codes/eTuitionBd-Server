import { createRequire } from "module";
const require = createRequire(import.meta.url);
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;
import jwt from 'jsonwebtoken';

// middleware
app.use(express.json());
app.use(cors());

const verifyJWTToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Authorization header is missing" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Invalid or expired token" });
    }

    req.user = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@simple-crud-cluster.0hdbxiy.mongodb.net/?appName=Simple-crud-cluster`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Welcome to eTuitionBD Server");
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("etuitionbd_db");
    const usersCollection = db.collection("users");
    const tuitionsCollection = db.collection("tuitions");
    const applicantsCollection = db.collection("applicants");
    const paymentsCollection = db.collection("payments");
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


    app.post('/get-token', (req, res)=>{
      const {email} = req.body;

      if(!email){
        return res.status(400).send({message: "Email is required"});
      }

      const token = jwt.sign({ email }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
      res.send({ token: token });
    })


    // users
    app.get("/api/users", async (req, res) => {
      try {
        const { role, search = "", page = 1, limit = 6 } = req.query;

        const currentPage = parseInt(page);
        const itemsPerPage = parseInt(limit);

        const skip = (currentPage - 1) * itemsPerPage;

        let query = {};

        if (role && role !== "undefined") {
          query.role = role.trim();
        }

        if (search) {
          query.$or = [
            {
              name: {
                $regex: search,
                $options: "i",
              },
            },

            {
              institution: {
                $regex: search,
                $options: "i",
              },
            },

            {
              qualification: {
                $regex: search,
                $options: "i",
              },
            },
          ];
        }

        const totalCount = await usersCollection.countDocuments(query);

        const users = await usersCollection
          .find(query)
          .skip(skip)
          .limit(itemsPerPage)
          .toArray();

        res.send({
          tutors: users,
          totalCount,
        });
      } catch (error) {
        console.error("Error fetching users:", error);

        res.status(500).send({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/user", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res
            .status(400)
            .send({ message: "Email query parameter is required" });
        }

        const query = { email: email };
        const result = await usersCollection.findOne(query);

        if (!result) {
          return res
            .status(404)
            .send({ message: "User not found in database" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/api/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.post("/api/users", async (req, res) => {
      try {
        const user = req.body;

        const query = {
          email: user.email,
        };

        const existingUser = await usersCollection.findOne(query);

        // ✅ already exists
        if (existingUser) {
          return res.send({
            success: false,
            message: "User already exists",
          });
        }

        const result = await usersCollection.insertOne(user);

        res.send({
          success: true,
          result,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    app.patch("/api/user", async (req, res) => {
      const { email } = req.query;
      const updatedData = req.body;
      const query = {};
      if (email) {
        query.email = email;
      }
      const result = await usersCollection.updateOne(query, {
        $set: updatedData,
      });

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "user not found" });
      }
      res.send(result);
    });

    app.patch("/api/users/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!status) {
          return res.status(400).send({
            success: false,
            message: "Status property is required in the request body.",
          });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };

        const result = await usersCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User account not found with the provided ID.",
          });
        }

        res.send({
          success: true,
          message: `User status successfully updated to ${status}.`,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error or invalid ObjectId format.",
        });
      }
    });

    // tuitions
    app.get("/api/tuitions", verifyJWTToken, async (req, res) => {
      console.log(req.headers);
      try {
        const search = req.query.search;
        const category = req.query.category;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        let query = {};

        if (search && search !== "undefined" && search.trim() !== "") {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { subject: { $regex: search, $options: "i" } },
            { location: { $regex: search, $options: "i" } },
          ];
        }

        if (category && category !== "All" && category !== "undefined") {
          query.category = category;
        }

        const totalCount = await tuitionsCollection.countDocuments(query);

        const tuitions = await tuitionsCollection
          .find(query)
          .sort({ _id: -1, title: 1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          tuitions,
          totalCount,
        });
      } catch (error) {
        console.error("Error fetching filtered tuitions:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    app.get("/api/tuitions/my-posts/:uid", async (req, res) => {
      const uid = req.params.uid;
      if (!uid) {
        return res.status(404).send({ message: "uid is required" });
      }
      const query = { studentUID: uid };
      const result = await tuitionsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/api/tuition/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!id) {
          return res.status(400).send({ message: "ID is required" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await tuitionsCollection.findOne(query);

        if (!result) {
          return res
            .status(404)
            .send({ message: "Tuition not found in database" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/api/tuitions", async (req, res) => {
      const tuitions = req.body;
      const query = { _id: tuitions._id };
      const existingPost = await tuitionsCollection.findOne(query);

      if (existingPost) {
        return res
          .status(400)
          .send({ message: "user already exists in database" });
      }
      const result = await tuitionsCollection.insertOne(tuitions);
      res.send(result);
    });

    app.patch("/api/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const query = { _id: new ObjectId(id) };
      const result = await tuitionsCollection.updateOne(query, {
        $set: updatedData,
      });
      res.send(result);
    });

    app.delete("/api/tuitions/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tuitionsCollection.deleteOne(query);
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Tuition not found" });
      } else {
        return res.send({ message: "Tuition deleted successfully" });
      }
    });

    // applicants
    app.post("/api/tuitions/apply", async (req, res) => {
      const apply = req.body;
      const query = { _id: apply._id };
      const existingApplicants = await applicantsCollection.findOne(query);

      if (existingApplicants) {
        return res.status(400).send({ message: "Already Applied" });
      }
      const result = await applicantsCollection.insertOne(apply);
      res.send(result);
    });

    app.get("/api/tuitions/applicants/:id", async (req, res) => {
      try {
        const tuitionId = req.params.id;

        console.log("Tuition ID:", tuitionId);

        const query = {
          tuitionId: tuitionId ,
        };

        console.log("Query:", query);

        const result = await applicantsCollection.find(query).toArray();

        console.log("Applicants:", result);

        res.send(result);
      } catch (error) {
        console.error("GET Applicants Error:", error);

        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    app.get("/api/applied-jobs", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email || email === "undefined" || email === "null") {
          return res.status(400).send({
            success: false,
            message: "Tutor email query parameter is required.",
          });
        }

        const query = { tutorEmail: email };

        const result = await applicantsCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching tutor applied jobs:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error while fetching applied tuitions.",
        });
      }
    });

    app.patch("/api/tuitions/application-status", async (req, res) => {
      try {

        const { tuitionId, tutorEmail } = req.query;
        const { status } = req.body;

        // backend server.js patch api এর ভেতর:
        if (!tuitionId || !tutorEmail || !status) {
          return res.status(400).send({
            success: false,
            message:
              "Missing parameters. tuitionId, tutorEmail, and status are all required.",
          });
        }

        // ভ্যালিডেশন পার হওয়ার পর trim করবেন
        const query = {
          tuitionId: new ObjectId(tuitionId),
          tutorEmail: tutorEmail,
        };

        const updateDoc = {
          $set: {
            status,
          },
        };

        const result = await applicantsCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Application not found",
          });
        }

        res.send({
          success: true,
          message: `Application ${status} successfully`,
        });
      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // payment history

    app.get("/api/payments/:email", async (req, res) => {
      try {
        const email = req.params.email; //

        if (!email || email === "undefined" || email === "null") {
          return res.status(400).send({
            success: false,
            message: "Valid user email parameter is required in the url path.",
          });
        }

        const query = { email: email.trim() };

        const result = await paymentsCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error while fetching transaction logs.",
        });
      }
    });

    app.post("/api/create-checkout-session", async (req, res) => {
      try {
        const { price, tuitionTitle, tuitionId, tutorId } = req.body;

        if (!price || !tuitionId || !tutorId) {
          return res.status(400).send({
            success: false,
            message:
              "Missing required details: price, tuitionId, and tutorId are needed.",
          });
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "bdt",
                product_data: {
                  name: tuitionTitle || "Tuition Matching Fee",
                  description: `Secure Escrow for Tutor ID: ${tutorId}`,
                },
                unit_amount: Math.round(parseFloat(price) * 100),
              },
              quantity: 1,
            },
          ],
          metadata: {
            tuitionId,
            tutorId,
          },
          success_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard/payment-success?tuitionId=${tuitionId}&tutorId=${tutorId}`,
          cancel_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard/student/view-applicants/${tuitionId}`,
        });

        res.send({ success: true, url: session.url });
      } catch (error) {
        console.error("Stripe Checkout Session Error:", error);
        res.status(500).send({
          success: false,
          message: "Stripe gateway configuration failed.",
          error: error.message,
        });
      }
    });

    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
