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
import jwt from "jsonwebtoken";

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
};

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

// মঙ্গোডিবি গ্লোবাল কালেকশন রেফারেন্স হোল্ডার ভাই
let db,
  usersCollection,
  tuitionsCollection,
  applicantsCollection,
  paymentsCollection,
  bookmarksCollection,
  activitiesCollection,
  stripe;

async function run() {
  try {
    db = client.db("etuitionbd_db");
    usersCollection = db.collection("users");
    tuitionsCollection = db.collection("tuitions");
    applicantsCollection = db.collection("applicants");
    paymentsCollection = db.collection("payments");
    bookmarksCollection = db.collection("bookmarks");
    activitiesCollection = db.collection("activities");
    stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

    app.post("/get-token", (req, res) => {
      const { email } = req.body;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const token = jwt.sign({ email }, process.env.JWT_SECRET_KEY, {
        expiresIn: "1h",
      });
      res.send({ token: token });
    });

    // public stats
    app.get("/api/public-stats", async (req, res) => {
      try {
        const [totalStudents, totalTutors, totalTuitions] = await Promise.all([
          usersCollection.countDocuments({ role: "student" }),
          usersCollection.countDocuments({ role: "tutor", isVerified: true }),
          tuitionsCollection.countDocuments({ status: "Approved" }),
        ]);

        res.send({
          totalStudents,
          totalTutors,
          totalTuitions,
        });
      } catch (error) {
        console.error("Public stats fetching server error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to load live platform stats",
        });
      }
    });

    // notices/blogs
    app.get("/api/notices", async (req, res) => {
      try {
        const result = await db
          .collection("notices")
          .find({})
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching notices from database:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch notices" });
      }
    });

    app.post("/api/admin/notices", verifyJWTToken, async (req, res) => {
      try {
        const noticeData = req.body;
        noticeData.createdAt = new Date();
        const result = await db.collection("notices").insertOne(noticeData);
        res.send({
          success: true,
          message: "Notice securely broadcasted to public feed",
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to insert notice into cluster",
        });
      }
    });

    app.delete("/api/admin/notices/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        const result = await db
          .collection("notices")
          .deleteOne({ _id: new ObjectId(id) });
        res.send({
          success: true,
          message: "Notice destroyed from database cluster",
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Database pipeline failed during delete",
        });
      }
    });

    app.patch("/api/admin/notices/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedNotice = req.body;
        delete updatedNotice._id; // আইডি মিউটেশন প্রোটেকশন ভাই

        const result = await db
          .collection("notices")
          .updateOne({ _id: new ObjectId(id) }, { $set: updatedNotice });
        res.send({
          success: true,
          message: "Notice record updated in MongoDB instance",
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Database pipeline failed during patch",
        });
      }
    });

    // contacts
    app.post("/api/contact", async (req, res) => {
      try {
        const messageData = req.body;
        messageData.submittedAt = new Date();
        const result = await db.collection("messages").insertOne(messageData);
        res.send({
          success: true,
          message: "Message securely saved to cluster",
          result,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Pipeline failed to store message",
        });
      }
    });

    app.get("/api/admin/messages", verifyJWTToken, async (req, res) => {
      try {
        const result = await db
          .collection("messages")
          .find({})
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch inbox messages" });
      }
    });

    app.delete("/api/admin/messages/:id", verifyJWTToken, async (req, res) => {
      const result = await db
        .collection("messages")
        .deleteOne({ _id: new ObjectId(req.params.id) });
      res.send({ success: true, result });
    });

    // users
    app.get("/api/users", async (req, res) => {
      try {
        const {
          role = "",
          search = "",
          page = 1,
          limit = 6,
          isAdminPanel = "false",
        } = req.query;

        let query = {};

        if (role && role !== "all" && role !== "undefined") {
          query.role = role;
        }

        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { institution: { $regex: search, $options: "i" } },
            { qualification: { $regex: search, $options: "i" } },
          ];
        }

        if (isAdminPanel === "true") {
          const allUsers = await usersCollection.find(query).toArray();
          return res.send(allUsers);
        }

        const currentPage = parseInt(page);
        const itemsPerPage = parseInt(limit);
        const skip = (currentPage - 1) * itemsPerPage;

        const totalCount = await usersCollection.countDocuments(query);
        const users = await usersCollection
          .find(query)
          .sort({ _id: -1 })
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

        if (!email || email === "undefined" || email === "null") {
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
      if (!ObjectId.isValid(id))
        return res.status(400).send({ message: "Invalid ID format" });
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.post("/api/users", async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);

        if (existingUser) {
          return res.send({
            success: false,
            message: "User already exists",
          });
        }

        const result = await usersCollection.insertOne(user);

        try {
          await activitiesCollection.insertOne({
            user: user.name || "Anonymous User",
            type:
              user.role === "tutor" ? "Tutor Registration" : "Student Signup",
            detail: `${user.name || "A user"} registered successfully from regional hub using ${user.email}`,
            status: user.role === "tutor" ? "Pending" : "Verified",
            date: new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          });
        } catch (logErr) {
          console.error("Operational logger injection failed:", logErr);
        }

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

        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
          },
        };

        const result = await usersCollection.updateOne(query, updateDoc);
        res.send({
          success: true,
          message: `User status successfully updated to ${status}.`,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.patch("/api/users/role/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;

        if (!role) {
          return res.status(400).send({
            success: false,
            message: "Role definition is required.",
          });
        }

        const validRoles = ["student", "tutor", "admin"];
        if (!validRoles.includes(role)) {
          return res.status(400).send({
            success: false,
            message: "Invalid role level tier provided.",
          });
        }

        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            role: role,
            roleUpdatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(query, updateDoc);

        if (result.modifiedCount > 0) {
          res.send({
            success: true,
            message: `User level successfully migrated to ${role}.`,
            modifiedCount: result.modifiedCount,
          });
        } else {
          res.send({
            success: false,
            message: "User already possesses the selected role level.",
          });
        }
      } catch (error) {
        console.error("Role update backend error:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error during tier migration.",
        });
      }
    });

    app.delete("/api/user/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };

        const userExist = await usersCollection.findOne(query);
        if (!userExist) {
          return res.status(404).send({
            success: false,
            message: "User account not found in database.",
          });
        }

        const result = await usersCollection.deleteOne(query);
        res.send({
          success: true,
          message: "User account permanently purged from platform.",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("User deletion error:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/tuitions", async (req, res) => {
      try {
        const {
          search = "",
          category = "",
          classLevel = "",
          subject = "",
          location = "",
          sortBy = "date",
          sortOrder = "desc",
          page = 1,
          limit = 6,
          isAdminPanel = "false",
        } = req.query;

        let query = {};

        if (isAdminPanel !== "true") {
          query.status = "Approved";
        }

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

        if (classLevel && classLevel !== "All" && classLevel !== "undefined") {
          query.classLevel = classLevel;
        }

        if (subject && subject !== "All" && subject !== "undefined") {
          query.subject = { $regex: subject, $options: "i" };
        }

        if (location && location !== "All" && location !== "undefined") {
          query.location = { $regex: location, $options: "i" };
        }

        let sortQuery = {};
        const orderDirection = sortOrder === "asc" ? 1 : -1;

        if (sortBy === "budget") {
          sortQuery.salary = orderDirection;
        } else {
          sortQuery._id = orderDirection;
        }

        if (isAdminPanel === "true") {
          const allTuitions = await tuitionsCollection
            .find(query)
            .sort(sortQuery)
            .toArray();
          return res.send(allTuitions);
        }

        const currentPage = parseInt(page) || 1;
        const itemsPerPage = parseInt(limit) || 6;
        const skip = (currentPage - 1) * itemsPerPage;

        const totalCount = await tuitionsCollection.countDocuments(query);
        const tuitions = await tuitionsCollection
          .find(query)
          .sort(sortQuery)
          .skip(skip)
          .limit(itemsPerPage)
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

    app.get("/api/tuitions/my-posts/:uid", verifyJWTToken, async (req, res) => {
      try {
        const uid = req.params.uid;
        if (!uid) {
          return res.status(400).send({ message: "uid is required" });
        }
        const query = { studentUID: uid };
        const result = await tuitionsCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error fetching user posts" });
      }
    });

    app.get("/api/tuition/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!id || !ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ message: "Valid document ID is required" });
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
        console.error("Error fetching tuition single document:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/api/tuitions", verifyJWTToken, async (req, res) => {
      try {
        const tuitionPost = req.body;
        tuitionPost.status = "pending";
        tuitionPost.postedAt = new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        delete tuitionPost._id;
        const result = await tuitionsCollection.insertOne(tuitionPost);

        try {
          await activitiesCollection.insertOne({
            user: tuitionPost.studentName || "System Student",
            type: "Tuition Circular",
            detail: `Posted new tuition requirement circular for Class: ${tuitionPost.classLevel || "N/A"} - Subject: ${tuitionPost.subject || "General Core"}`,
            status: "Pending",
            date: new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          });
        } catch (logErr) {
          console.error("Logger insertion error on tuition post:", logErr);
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to create tuition post" });
      }
    });

    app.patch("/api/tuitions/status/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!status) {
          return res.status(400).send({ message: "Status is required" });
        }

        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };
        const result = await tuitionsCollection.updateOne(query, {
          $set: { status: status, moderatedAt: new Date() },
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update moderation status" });
      }
    });

    app.patch("/api/tuitions/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        delete updatedData._id;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };

        const result = await tuitionsCollection.updateOne(query, {
          $set: updatedData,
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update action failed" });
      }
    });

    app.delete("/api/tuitions/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };

        const result = await tuitionsCollection.deleteOne(query);
        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Tuition post not found or already removed.",
          });
        } else {
          return res.send({
            success: true,
            message: "Tuition post deleted successfully.",
            deletedCount: result.deletedCount,
          });
        }
      } catch (error) {
        console.error("Error deleting tuition:", error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    app.post("/api/tuitions/apply", verifyJWTToken, async (req, res) => {
      try {
        const applyData = req.body;
        const checkQuery = {
          tuitionId: applyData.tuitionId,
          tutorEmail: applyData.tutorEmail,
        };

        const existingApplicant =
          await applicantsCollection.findOne(checkQuery);
        if (existingApplicant) {
          return res
            .status(400)
            .send({ message: "You have already applied for this tuition!" });
        }

        delete applyData._id;
        const result = await applicantsCollection.insertOne(applyData);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Application execution failed" });
      }
    });

    app.delete("/api/tuitions/apply/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };

        const application = await applicantsCollection.findOne(query);

        if (!application) {
          return res
            .status(404)
            .send({ success: false, message: "Application record not found." });
        }

        if (application.status && application.status !== "pending") {
          return res.status(400).send({
            success: false,
            message:
              "Action Denied! You cannot withdraw/delete an approved or processed application.",
          });
        }

        const result = await applicantsCollection.deleteOne(query);
        res.send({ success: true, deletedCount: result.deletedCount });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Internal Server Error" });
      }
    });

    // 🔄 পেন্ডিং টিউটরদের কিউ আনার গেট এপিআই
    app.get("/api/admin/pending-tutors", verifyJWTToken, async (req, res) => {
      try {
        // 🎯 ফিক্স: কুয়েরিতে ভেরিফিকেশন স্ট্যাটাস ফিল্টারিং মঙ্গোডিবি প্রপার্টি লকড করা হলো ভাই
        const query = {
          role: "tutor",
          $or: [
            { verificationStatus: "Pending" },
            { verificationStatus: { $exists: false } },
            { isVerified: false },
          ],
        };

        const pendingTutors = await usersCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();
        res.send(pendingTutors);
      } catch (error) {
        console.error("Error fetching pending tutors:", error);
        res
          .status(500)
          .send({ message: "Internal server error loading tutors queue." });
      }
    });

    // 🚫 টিউটর রিকোয়েস্ট অ্যাকসেপ্ট বা রিজেক্ট (PATCH) এপিআই ভাই
    app.patch("/api/admin/verify-tutor", verifyJWTToken, async (req, res) => {
      try {
        const { email } = req.query;
        const { status } = req.body;

        if (!email || !status) {
          return res.status(400).send({
            message: "Email parameter and status declaration are required.",
          });
        }

        const query = { email: email, role: "tutor" };
        const isApproved = status === "Approved";

        // 🎯 ফিক্স: রিজেক্ট হলে টিউটরকে সরাসরি ডিমোট করে স্টুডেন্ট বানানো এবং ডাটাবেজ আপডেট ক্লিন করা হলো ভাই
        const updateDoc = {
          $set: {
            isVerified: isApproved,
            verificationStatus: status,
            verifiedAt: isApproved ? new Date() : null,
            // যদি এপ্রুভ না হয় (Rejected), রোল ডিমোট হয়ে 'student' হয়ে যাবে, যাতে সে পেন্ডিং কিউ থেকে নিমেষেই গায়েব হয়ে যায় ভাই
            role: isApproved ? "tutor" : "student",
          },
        };

        const result = await usersCollection.updateOne(query, updateDoc);
        if (result.matchedCount === 0) {
          return res.status(404).send({
            message: "No pending tutor found with this registered email.",
          });
        }

        res.send(result);
      } catch (error) {
        console.error("Error updates verification logic:", error);
        res
          .status(500)
          .send({ message: "Verification processing execution failed." });
      }
    });

    app.get("/api/admin/dashboard-stats", verifyJWTToken, async (req, res) => {
      try {
        const [totalStudents, verifiedTutors, activeTuitions, pendingTuitions] =
          await Promise.all([
            usersCollection.countDocuments({ role: "student" }),
            usersCollection.countDocuments({ role: "tutor", isVerified: true }),
            tuitionsCollection.countDocuments({ status: "Approved" }),
            tuitionsCollection.countDocuments({ status: "pending" }),
          ]);

        res.send({
          totalStudents,
          verifiedTutors,
          activeTuitions,
          pendingTuitions,
        });
      } catch (error) {
        console.error("Dashboard stats backend error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to load system overview stats",
        });
      }
    });
    app.get(
      "/api/tuitions/applicants/:id",
      verifyJWTToken,
      async (req, res) => {
        try {
          const tuitionId = req.params.id;

          // ডাটাবেজের ফিল্ডের নাম 'tuitionId' ঠিক আছে, তবে আমরা এখন নিশ্চিত করছি যে এটি ঠিকঠাক ফিল্টার হচ্ছে
          const result = await applicantsCollection
            .find({ tuitionId: tuitionId })
            .toArray();

          // কনসোল লগ দিয়ে দেখুন কী আইডি আসছে
          // console.log("Searching in applicants for tuitionId:", tuitionId);
          // console.log("Results found:", result.length);

          res.send(result);
        } catch (error) {
          res.status(500).send({ success: false, message: error.message });
        }
      },
    );

    app.get("/api/applied-jobs", verifyJWTToken, async (req, res) => {
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

    app.patch("/api/applied-jobs/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { proposal } = req.body;

        if (!ObjectId.isValid(id))
          return res.status(400).send({ message: "Invalid ID format" });
        const query = { _id: new ObjectId(id) };
        const application = await applicantsCollection.findOne(query);

        if (!application) {
          return res
            .status(404)
            .send({ success: false, message: "Application record not found." });
        }

        if (application.status && application.status !== "pending") {
          return res.status(400).send({
            success: false,
            message: "Action denied. Approved requests cannot be modified.",
          });
        }

        const updateDoc = {
          $set: {
            proposal: proposal,
            proposalAt: new Date().toLocaleString("en-US", {
              timeZone: "Asia/Dhaka",
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          },
        };

        const result = await applicantsCollection.updateOne(query, updateDoc);
        res.send({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, message: "Internal server error" });
      }
    });

    // একদম এই কোডটি কপি করে আপনার আগের রাউটটি রিপ্লেস করুন
    app.patch(
      "/api/tuitions/application-status",
      async (req, res) => {
        try {
          const { tuitionId, tutorId } = req.query;
          const { status } = req.body;

          // console.log("Backend receiving:", { tuitionId, tutorId, status });

          if (!tuitionId || !tutorId || !status) {
            return res
              .status(400)
              .send({ success: false, message: "Missing required params" });
          }

          // এখানে খেয়াল করুন: কোনো new ObjectId() ব্যবহার করিনি, কারণ ডাটাবেজে এগুলো স্ট্রিং
          const result = await applicantsCollection.updateOne(
            { tuitionId: tuitionId, tutorId: tutorId },
            { $set: { status: status, updatedAt: new Date() } },
          );

          if (result.matchedCount === 0) {
            return res
              .status(404)
              .send({
                success: false,
                message: "Record not found in database",
              });
          }

          res.send({ success: true, message: "Status updated successfully" });
        } catch (error) {
          console.error("Patch Error:", error);
          res.status(500).send({ success: false, message: error.message });
        }
      },
    );

    app.get(
      "/api/admin/financial-reports",
      verifyJWTToken,
      async (req, res) => {
        try {
          const query = { status: "successful" };
          const transactions = await paymentsCollection
            .find(query)
            .sort({ _id: -1 })
            .toArray();

          const totalEarnings = transactions.reduce(
            (sum, tx) => sum + parseFloat(tx.amount || 0),
            0,
          );

          res.send({
            transactions,
            totalEarnings: totalEarnings.toFixed(2),
          });
        } catch (error) {
          console.error("Financial analytics processing server error:", error);
          res.status(500).send({
            success: false,
            message: "Internal analytics error",
          });
        }
      },
    );

    app.get("/api/payments/:email", verifyJWTToken, async (req, res) => {
      try {
        const email = req.params.email;

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
          message: "Internal server error",
        });
      }
    });

    app.post(
      "/api/create-checkout-session",
      verifyJWTToken,
      async (req, res) => {
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
            metadata: { tuitionId, tutorId },
            success_url: `${process.env.CLIENT_URL || "https://etuitionbd-monir.vercel.app"}/dashboard/payment-success?tuitionId=${tuitionId}&tutorId=${tutorId}`,
            cancel_url: `${process.env.CLIENT_URL || "https://etuitionbd-monir.vercel.app"}/dashboard/student/view-applicants/${tuitionId}`,
          });

          res.send({ success: true, url: session.url });
        } catch (error) {
          console.error("Stripe Checkout Session Error:", error);
          res.status(500).send({
            success: false,
            message: "Stripe gateway configuration failed.",
          });
        }
      },
    );

    // 💳 পেমেন্ট সাকসেস হওয়ার পর ডাটাবেজে রেকর্ড করা ও স্ট্যাটাস আপডেট করার এপিআই
    app.post("/api/payments/record", verifyJWTToken, async (req, res) => {
      try {
        const paymentData = req.body; // ফ্রন্টএন্ড থেকে আসা পেমেন্ট ডিটেইলস
        const { tuitionId, tutorId, price, transactionId, studentEmail } =
          paymentData;

        // ১. পেমেন্ট কালেকশনে ডাটা ইনসার্ট করা
        const paymentResult = await paymentsCollection.insertOne({
          ...paymentData,
          status: "successful",
          date: new Date(),
        });

        // ২. টিউশন স্ট্যাটাস 'Approved' করা
        const tuitionResult = await tuitionsCollection.updateOne(
          { _id: new ObjectId(tuitionId) },
          { $set: { status: "Approved", tutorId: tutorId } },
        );

        // ৩. অ্যাপ্লিকেন্ট স্ট্যাটাস 'Accepted' করা
        await applicantsCollection.updateOne(
          { tuitionId: tuitionId, tutorId: tutorId },
          { $set: { status: "accepted" } },
        );

        res.send({ success: true, paymentResult, tuitionResult });
      } catch (error) {
        console.error("Payment recording error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to record payment" });
      }
    });

    app.post("/api/bookmarks", verifyJWTToken, async (req, res) => {
      try {
        const bookmarkData = req.body;
        const query = {
          userEmail: bookmarkData.userEmail,
          tuitionId: bookmarkData.tuitionId,
        };

        const existingBookmark = await bookmarksCollection.findOne(query);
        if (existingBookmark) {
          return res
            .status(400)
            .send({ success: false, message: "Already bookmarked this post!" });
        }

        const result = await bookmarksCollection.insertOne(bookmarkData);
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: "Failed to bookmark" });
      }
    });

    app.get("/api/my-bookmarks/:email", verifyJWTToken, async (req, res) => {
      try {
        const email = req.params.email;
        const userBookmarks = await bookmarksCollection
          .find({ userEmail: email })
          .toArray();
        const tuitionIds = userBookmarks.map((b) => new ObjectId(b.tuitionId));

        const bookmarkedTuitions = await tuitionsCollection
          .find({ _id: { $in: tuitionIds } })
          .toArray();
        res.send(bookmarkedTuitions);
      } catch (error) {
        res.status(500).send({ message: "Server error fetching bookmarks" });
      }
    });

    app.delete("/api/bookmarks", verifyJWTToken, async (req, res) => {
      try {
        const { userEmail, tuitionId } = req.query;
        const query = { userEmail, tuitionId };

        const result = await bookmarksCollection.deleteOne(query);
        res.send({ success: true, deletedCount: result.deletedCount });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Failed to remove bookmark" });
      }
    });

    // ==========================================
    // 👑 ডাটাবেজ ড্রিভেন সিস্টেম অ্যাক্টিভিটি রাউটস ইঞ্জিন
    // ==========================================
    app.get("/api/admin/activities", verifyJWTToken, async (req, res) => {
      try {
        const result = await activitiesCollection
          .find({})
          .sort({ _id: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to read database operation logs",
        });
      }
    });

    app.patch("/api/admin/activities/:id", verifyJWTToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { user, detail, status } = req.body;

        if (!ObjectId.isValid(id))
          return res
            .status(400)
            .send({ success: false, message: "Invalid ID format" });

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { user, detail, status, updatedAt: new Date() },
        };

        const result = await activitiesCollection.updateOne(query, updateDoc);
        res.send({
          success: true,
          message: "Log updated successfully in database",
          result,
        });
      } catch (error) {
        res
          .status(500)
          .send({ success: false, message: "Database patch workflow failure" });
      }
    });

    app.delete(
      "/api/admin/activities/:id",
      verifyJWTToken,
      async (req, res) => {
        try {
          const id = req.params.id;
          if (!ObjectId.isValid(id))
            return res
              .status(400)
              .send({ success: false, message: "Invalid ID format" });

          const query = { _id: new ObjectId(id) };
          const result = await activitiesCollection.deleteOne(query);
          res.send({
            success: true,
            message: "Purged log from cloud cluster",
            result,
          });
        } catch (error) {
          res.status(500).send({
            success: false,
            message: "Database deletion pipeline crashed",
          });
        }
      },
    );
  } finally {
    // Client close block disabled for continuous cloud server runtime
  }
}

// রান ফাংশন এক্সিকিউশন ট্র্যাকার
run().catch(console.dir);

// পোর্ট লিসেনার ব্লকের সেফ পজিশন শিফটিং লক
app.listen(port, () => {
  // console.log(`eTuitionBD Operational Server Core live on port: ${port} 🚀`);
});
