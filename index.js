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

// middleware
app.use(express.json());
app.use(cors());

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
    await client.connect();

    const db = client.db("etuitionbd_db");
    const usersCollection = db.collection("users");
    const tuitionsCollection = db.collection("tuitions");
    const appliantsCollection = db.collection("applicants");
    const paymentsCollection = db.collection("payments");

    // users
    app.get("/api/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
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

    app.post("/api/users", async (req, res) => {
      const user = req.body;
      const query = { _id: user._id };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res
          .status(400)
          .send({ message: "user already exists in database" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
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
    app.get("/api/tuitions", async (req, res) => {
      try {
        const { search, category } = req.query;

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

        const result = await tuitionsCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching filtered tuitions:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
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
      const existingApplicants = await appliantsCollection.findOne(query);

      if (existingApplicants) {
        return res.status(400).send({ message: "Already Applied" });
      }
      const result = await appliantsCollection.insertOne(apply);
      res.send(result);
    });

    app.get("/api/tuitions/applicants/:id", async (req, res) => {
      try {
        const tuitionId = req.params.id;
        if (!tuitionId) {
          return res
            .status(400)
            .send({ success: false, message: "Tuition ID is required." });
        }

        const query = { tuitionId: tuitionId };

        const result = await appliantsCollection.find(query).toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching applicants:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    app.patch("/api/tuitions/application-status", async (req, res) => {
      try {
        const { tuitionId, tutorId, status } = req.body;

        if (!tuitionId || !tutorId || !status) {
          return res.status(400).send({
            success: false,
            message:
              "Missing parameters. tuitionId, tutorId, and status are all required.",
          });
        }

        const query = {
          tuitionId: tuitionId,
          tutorId: tutorId,
        };

        const updateDoc = {
          $set: {
            status: status,
          },
        };

        const result = await appliantsCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "No application record found to update.",
          });
        }

        res.send({
          success: true,
          message: `Application status successfully updated to ${status}.`,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating application status:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
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

    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
