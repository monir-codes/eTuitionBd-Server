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

// const verifyJWTToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader) {
//     return res.status(401).send({ message: "Authorization header is missing" });
//   }

//   const token = authHeader.split(" ")[1];

//   jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
//     if (err) {
//       return res.status(401).send({ message: "Invalid or expired token" });
//     }

//     req.user = decoded;
//     next();
//   });
// };

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
    const bookmarksCollection = db.collection("bookmarks");
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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

        // ১. রোল ফিল্টারিং (যদি role 'all' বা 'undefined' না হয়)
        if (role && role !== "all" && role !== "undefined") {
          query.role = role;
        }

        // ২. সার্চ মেকানিজম (name, email, institution, qualification সব কভার করবে)
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }, // 📧 ইমেইল সার্চ অ্যাড করা হলো স্টুডেন্টদের জন্য
            { institution: { $regex: search, $options: "i" } },
            { qualification: { $regex: search, $options: "i" } },
          ];
        }

        // 🔒 কন্ডিশনাল চেকিং: অ্যাডমিন প্যানেল নাকি সাধারণ পাবলিক পেজ?
        if (isAdminPanel === "true") {
          // 👑 অ্যাডমিন প্যানেলের জন্য: কোনো পেজিনেশন/লিমিট নেই, ডিরেক্ট সব ইউজার (স্টুডেন্ট + টিউটর) এক অ্যারেতে যাবে
          const allUsers = await usersCollection.find(query).toArray();
          return res.send(allUsers);
        }

        // 🏠 পাবলিক / হোমপেজের জন্য: লেটেস্ট টিউটরদের ডাটা পেজিনেশন সহ (আপনার আগের লজিক)
        const currentPage = parseInt(page);
        const itemsPerPage = parseInt(limit);
        const skip = (currentPage - 1) * itemsPerPage;

        const totalCount = await usersCollection.countDocuments(query);
        const users = await usersCollection
          .find(query)
          .sort({ _id: -1 }) // 🕒 লেটেস্ট ডাটা আগে দেখানোর জন্য সর্ট
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

        const query = { _id: new ObjectId(id) };

        const userExist = await usersCollection.findOne(query);
        if (!userExist) {
          return res.status(404).send({
            success: false,
            message: "User account not found in database.",
          });
        }

        const result = await usersCollection.deleteOne(query);

        if (result.deletedCount > 0) {
          res.send({
            success: true,
            message: "User account permanently purged from platform.",
            deletedCount: result.deletedCount,
          });
        } else {
          res.status(400).send({
            success: false,
            message: "Failed to delete the user account.",
          });
        }
      } catch (error) {
        console.error("User deletion error:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error while executing account purge.",
        });
      }
    });

    app.get("/api/tuitions", async (req, res) => {
      try {
        const {
          search = "",
          category = "",
          classLevel = "", // 🧩 নতুন রিসিভড ফিল্টার: ক্লাস
          subject = "", // 🧩 নতুন রিসিভড ফিল্টার: সাবজেক্ট
          location = "", // 🧩 নতুন রিসিভড ফিল্টার: লোকেশন
          sortBy = "date", // 📈 সর্টিং ফিল্ড: 'date' অথবা 'budget'
          sortOrder = "desc", // 📈 সর্টিং অর্ডার: 'desc' অথবা 'asc'
          page = 1,
          limit = 6,
          isAdminPanel = "false",
        } = req.query;

        let query = {};

        // 🔒 সিকিউরিটি: অ্যাডমিন প্যানেল না হলে শুধু Approved পোস্ট দেখাবে
        if (isAdminPanel !== "true") {
          query.status = "Approved";
        }

        // 🔍 ১. গ্লোবাল সার্চ মেকানিজম (টাইটেল, সাবজেক্ট বা লোকেশন)
        if (search && search !== "undefined" && search.trim() !== "") {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { subject: { $regex: search, $options: "i" } },
            { location: { $regex: search, $options: "i" } },
          ];
        }

        // 🎯 ২. মিডিয়াম/ক্যাটাগরি ফিল্টার
        if (category && category !== "All" && category !== "undefined") {
          query.category = category;
        }

        // 🎯 ৩. ক্লাস লেভেল অ্যাডভান্সড ফিল্টার
        if (classLevel && classLevel !== "All" && classLevel !== "undefined") {
          query.classLevel = classLevel;
        }

        // 🎯 ৪. সুনির্দিষ্ট সাবজেক্ট ফিল্টার (কেস-ইনসেন্সিটিভ সার্চ সেফটি সহ)
        if (subject && subject !== "All" && subject !== "undefined") {
          query.subject = { $regex: subject, $options: "i" };
        }

        // 🎯 ৫. সুনির্দিষ্ট লোকেশন ফিল্টার
        if (location && location !== "All" && location !== "undefined") {
          query.location = { $regex: location, $options: "i" };
        }

        // 📈 ৬. ডাইনামিক সর্টিং মেকানিজম (Challenge 1)
        let sortQuery = {};
        const orderDirection = sortOrder === "asc" ? 1 : -1; // asc হলে ১, desc হলে -১

        if (sortBy === "budget") {
          // স্যালারি/বাজেট অনুযায়ী সর্ট হবে (ডাটাবেজের 'salary' ফিল্ড ম্যাচ করে)
          sortQuery.salary = orderDirection;
        } else {
          // ডিফল্ট সর্ট: নতুন থেকে পুরনো ডেট অনুযায়ী (_id-এর টাইমস্ট্যাম্প ট্র্যাক করে)
          sortQuery._id = orderDirection;
        }

        // 👑 অ্যাডমিন প্যানেলের স্পেশাল কন্ডিশন: কোনো পেজিনেশন ছাড়াই সব ফিল্টারড ডাটা একসাথে যাবে
        if (isAdminPanel === "true") {
          const allTuitions = await tuitionsCollection
            .find(query)
            .sort(sortQuery) // এখানেও ডাইনামিক সর্ট কাজ করবে
            .toArray();
          return res.send(allTuitions);
        }

        // 📄 ৭. পাবলিক পেজের জন্য পেজিনেশন ইঞ্জিন ক্যালকুলেশন (Challenge 2)
        const currentPage = parseInt(page) || 1;
        const itemsPerPage = parseInt(limit) || 6;
        const skip = (currentPage - 1) * itemsPerPage;

        // টোটাল কাউন্ট এবং কুয়েরি এক্সিকিউশন
        const totalCount = await tuitionsCollection.countDocuments(query);
        const tuitions = await tuitionsCollection
          .find(query)
          .sort(sortQuery) // ডাইনামিক সর্ট ইঞ্জিন অ্যাপ্লাইড
          .skip(skip)
          .limit(itemsPerPage)
          .toArray();

        // ফ্রন্টএন্ডে অবজেক্ট রেসপন্স পাঠানো
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
        console.error("Error fetching tuition single document:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/api/tuitions", async (req, res) => {
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
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to create tuition post" });
      }
    });

    app.patch("/api/tuitions/status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body; // 'Approved' or 'Rejected'

        if (!status) {
          return res.status(400).send({ message: "Status is required" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await tuitionsCollection.updateOne(query, {
          $set: { status: status, moderatedAt: new Date() },
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update moderation status" });
      }
    });

    app.patch("/api/tuitions/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        delete updatedData._id;

        const query = { _id: new ObjectId(id) };
        const result = await tuitionsCollection.updateOne(query, {
          $set: updatedData,
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update action failed" });
      }
    });

    app.delete("/api/tuitions/:id", async (req, res) => {
      try {
        const id = req.params.id;
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

    app.post("/api/tuitions/apply", async (req, res) => {
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

    app.delete("/api/tuitions/apply/:id", async (req, res) => {
      try {
        const id = req.params.id;
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

    // applicants

    app.get("/api/admin/pending-tutors", async (req, res) => {
      try {
        const query = {
          role: "tutor",
          $or: [{ isVerified: false }, { isVerified: { $exists: false } }],
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

    app.patch("/api/admin/verify-tutor", async (req, res) => {
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
        const updateDoc = {
          $set: {
            isVerified: isApproved,
            verificationStatus: status,
            verifiedAt: isApproved ? new Date() : null,
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

    app.get("/api/admin/dashboard-stats", async (req, res) => {
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

    app.get("/api/tuitions/applicants/:id", async (req, res) => {
      try {
        const tuitionId = req.params.id;


        const query = {
          tuitionId: tuitionId,
        };


        const result = await applicantsCollection.find(query).toArray();


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

    app.patch("/api/applied-jobs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { proposal } = req.body; // সুইটঅ্যালার্ট২ থেকে আসা নতুন টেক্সট

        const query = { _id: new ObjectId(id) };
        const application = await applicantsCollection.findOne(query); // 👈 আপনার ডাটাবেজের অ্যাপ্লিকেশন কালেকশন ভেরিয়েবল নাম দিবেন ভাই

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

        // ৩. ডাটা আপডেট ডকুমেন্ট
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

  

    // payment history

    app.patch("/api/tuitions/application-status", async (req, res) => {
      try {
        const { tuitionId, tutorEmail } = req.query;
        const { status } = req.body;

        if (!tuitionId || !tutorEmail || !status) {
          return res.status(400).send({
            success: false,
            message: "tuitionId, tutorEmail and status are required",
          });
        }

        const result = await applicantsCollection.updateOne(
          {
            tuitionId,
            tutorEmail,
          },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Application not found",
          });
        }

        if (result.modifiedCount === 0) {
          return res.status(200).send({
            success: true,
            message: "Status already updated",
          });
        }

        res.status(200).send({
          success: true,
          message: "Application status updated successfully",
          result,
        });
      } catch (error) {
        console.error("Application Status Update Error:", error);

        res.status(500).send({
          success: false,
          message: error.message,
          stack: error.stack,
        });
      }
    });

    app.get("/api/admin/financial-reports", async (req, res) => {
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

        // ৪. ফ্রন্টএন্ডে প্রফেশনাল অবজেক্ট স্ট্রাকচার রেসপন্স পাঠানো
        res.send({
          transactions,
          totalEarnings: totalEarnings.toFixed(2), // দশমিকের পর ২ ঘর রাখার জন্য
        });
      } catch (error) {
        console.error("Financial analytics processing server error:", error);
        res.status(500).send({
          success: false,
          message: "Internal analytics breakdown server error",
        });
      }
    });

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

    // bookmarks

    app.post("/api/bookmarks", async (req, res) => {
      try {
        const bookmarkData = req.body; // ফ্রন্টএন্ড থেকে { userEmail, tuitionId } আসবে

        // ডুপ্লিকেট চেক: ইউজার এই পোস্ট অলরেডি বুকমার্ক করেছে কিনা
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

    app.get("/api/my-bookmarks/:email", async (req, res) => {
      try {
        const email = req.params.email;

        // প্রথমে ইউজারের ইমেইল দিয়ে সব বুকমার্ক ডাটা আনা হলো
        const userBookmarks = await bookmarksCollection
          .find({ userEmail: email })
          .toArray();

        // বুকমার্ক করা প্রতিটা টিউশন আইডির মেইন ডিটেইলস ডাটাবেজ থেকে একবারে তুলে আনা
        const tuitionIds = userBookmarks.map((b) => new ObjectId(b.tuitionId));

        // $in অপারেটর দিয়ে সব টিউশন ডাটা একসাথে ফেচ করা
        const bookmarkedTuitions = await tuitionsCollection
          .find({ _id: { $in: tuitionIds } })
          .toArray();

        res.send(bookmarkedTuitions);
      } catch (error) {
        res.status(500).send({ message: "Server error fetching bookmarks" });
      }
    });

    app.delete("/api/bookmarks", async (req, res) => {
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
