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
        res
          .status(500)
          .send({
            success: false,
            message: "Failed to load system overview stats",
          });
      }
    });

    app.get("/api/tuitions/applicants/:id", async (req, res) => {
      try {
        const tuitionId = req.params.id;

        console.log("Tuition ID:", tuitionId);

        const query = {
          tuitionId: tuitionId,
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
import { useState } from "react";
import { motion } from "framer-motion";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  X,
  Mail,
  Phone,
  GraduationCap,
  Loader2,
  AlertTriangle,
  FileText,
  ArrowLeft,
} from "lucide-react";
import useAxios from "../../../hooks/useAxios";
import { toast } from "react-toastify";
import useAuth from "../../../hooks/useAuth";

const ViewApplicants = () => {
  const { id } = useParams(); // tuitionId
  const { user } = useAuth();
  const axiosSecure = useAxios();
  const queryClient = useQueryClient();

  // ✅ ১. TanStack Query: আবেদনকারী টিউটরদের লিস্ট ফেচ করা (ইன்பিনিট লুপ ফিক্সড)
  const {
    data: applicants = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["applicants", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await axiosSecure.get(`/api/tuitions/applicants/${id}`);
      return res.data;
    },
  });

  // ✅ ২. Reject Mutation (ব্যাকএন্ডের ইমেইল কুয়েরির সাথে ১০০% সিঙ্কড)
  const rejectMutation = useMutation({
    mutationFn: async ({ tutorEmail }) => {
      // 🎯 ফিক্স: tutorId এর জায়গায় tutorEmail পাঠানো হচ্ছে ব্যাকএন্ড ডিমান্ড অনুযায়ী
      const res = await axiosSecure.patch(`/api/tuitions/application-status?tuitionId=${id}&tutorEmail=${tutorEmail}`, {
        status: "rejected",
      });

      if (!res.data.success) {
        throw new Error(res.data.message || "Failed to reject application.");
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants", id] });
      toast.error("Tutor proposal rejected successfully.");
    },
    onError: (err) => {
      console.error(err);
      toast.error(err?.response?.data?.message || err?.message || "Failed to reject application.");
    },
  });

  // ✅ ৩. Checkout Mutation (স্ট্রাইপ হোস্টেড ফর্ম সেশন তৈরি)
  const checkoutMutation = useMutation({
    mutationFn: async ({ tutorId, tuitionTitle, price }) => {
      const res = await axiosSecure.post("/api/create-checkout-session", {
        price: Number(price) || 5000,
        tuitionTitle,
        tuitionId: id,
        tutorId,
        studentEmail: user?.email,
        studentName: user?.displayName,
      });

      if (!res.data?.url) {
        throw new Error("Failed to create payment session.");
      }
      return res.data;
    },
    onSuccess: (data) => {
      toast.info("Redirecting to Stripe Secure Gateway...");
      window.location.href = data.url; 
    },
    onError: (err) => {
      console.error(err);
      toast.error(err?.response?.data?.message || err?.message || "Gateway communication failed.");
    },
  });

  // ✅ Accept Handler
  const handleAcceptClick = (tutorId, tuitionTitle, salary) => {
    const cleanPrice = typeof salary === "string" ? salary.replace(/[^0-9.]/g, "") : salary;

    checkoutMutation.mutate({
      tutorId,
      tuitionTitle: tuitionTitle || "Tuition Matching Secure Escrow",
      price: cleanPrice || 5000,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="animate-spin text-[#40bfff]" size={40} />
        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest text-center">
          Loading Applied Tutors...
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2 text-rose-500 px-4 text-center">
        <AlertTriangle size={40} />
        <p className="font-black uppercase tracking-wider">
          Sync Error: {error.message}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 sm:space-y-8 w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 shadow-none py-4"
      style={{ fontFamily: "'League Spartan', sans-serif" }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100/60 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-800 mb-1 leading-tight">
            Tutor Applications
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs">
            Review proposals, check profiles, and hire the perfect tutor
          </p>
        </div>

        <Link to="/dashboard/student/my-posts">
          <button className="inline-flex items-center gap-2 text-slate-500 font-black hover:text-[#40bfff] transition-colors uppercase tracking-widest text-[10px] sm:text-xs">
            <ArrowLeft size={14} />
            My Circulars
          </button>
        </Link>
      </div>

      {/* 📜 Applicants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 w-full">
        {applicants && applicants.length > 0 ? (
          applicants.map((app) => (
            <div
              key={app._id || app.tutorId}
              className={`bg-white p-5 sm:p-6 lg:p-8 rounded-[2.5rem] sm:rounded-[3rem] border transition-all flex flex-col justify-between gap-5 relative overflow-hidden ${
                app.status === "accepted" || app.status === "approved"
                  ? "border-emerald-200 shadow-lg shadow-emerald-100/20 bg-emerald-50/5"
                  : app.status === "rejected"
                  ? "border-rose-100/70 bg-rose-50/5 opacity-75"
                  : "border-slate-100 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.02)] hover:shadow-xl hover:shadow-blue-100/20"
              }`}
            >
              {/* Status Badges */}
              {(app.status === "accepted" || app.status === "approved") && (
                <span className="absolute top-5 right-6 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm">
                  Approved / Hired
                </span>
              )}

              {app.status === "rejected" && (
                <span className="absolute top-5 right-6 bg-rose-50 text-rose-500 border border-rose-100 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                  Rejected
                </span>
              )}

              {/* Profile Content */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 min-w-0 pr-24">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 shrink-0">
                    <img
                      src={app.tutorImage || "https://i.ibb.co/default-avatar.png"}
                      className="w-full h-full object-cover"
                      alt="Tutor"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-black text-slate-800 truncate">
                      {app.tutorName || "Anonymous Tutor"}
                    </h3>

                    <p className="text-[11px] sm:text-xs text-[#40bfff] font-black flex items-center gap-1 mt-0.5 uppercase tracking-wider truncate">
                      <GraduationCap size={13} className="shrink-0" />
                      <span className="truncate">
                        {app.tutorInstitution || "Expert Varsity Mentor"}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold text-slate-500 pt-1 border-y border-slate-50 py-3 w-full">
                  <p className="flex items-center gap-1.5 min-w-0">
                    <Mail size={13} className="text-slate-400 shrink-0" />
                    <span className="truncate text-slate-600">
                      {app.tutorEmail}
                    </span>
                  </p>

                  <p className="flex items-center gap-1.5 min-w-0">
                    <Phone size={13} className="text-slate-400 shrink-0" />
                    <span className="text-slate-600 truncate">
                      {app.tutorPhone || "Hidden on Log"}
                    </span>
                  </p>
                </div>

                {/* Proposal Section */}
                <div className="bg-slate-50/80 p-4 rounded-2xl space-y-1 border border-slate-100/50 w-full">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <FileText size={12} />
                    Tutor's Proposal Statement
                  </p>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed break-words">
                    {app.proposal || "No cover letter submitted by the tutor."}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              {(app.status === "pending" || !app.status) && (
                <div className="flex flex-col sm:flex-row gap-2.5 border-t border-slate-50/80 pt-4 mt-2 w-full">
                  {/* Accept & Pay */}
                  <button
                    onClick={() =>
                      handleAcceptClick(
                        app.tutorId,
                        app.tuitionTitle || "Tuition Matching Secure Fee",
                        app.tuitionSalary || 5000
                      )
                    }
                    disabled={checkoutMutation.isPending || rejectMutation.isPending}
                    className="w-full sm:flex-1 h-11 bg-emerald-50 text-emerald-600 rounded-xl font-black text-xs hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center gap-1.5 border border-emerald-100 disabled:opacity-50 shadow-sm active:scale-95"
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                    <span>Accept & Pay Securely</span>
                  </button>

                  {/* Reject (পাসিং ভ্যালু ফিক্সড) */}
                  <button
                    onClick={() => rejectMutation.mutate({ tutorEmail: app.tutorEmail })}
                    disabled={checkoutMutation.isPending || rejectMutation.isPending}
                    className="w-full sm:w-28 h-11 bg-rose-50 text-rose-500 rounded-xl font-black text-xs hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center gap-1.5 border border-rose-100 disabled:opacity-50 active:scale-95"
                  >
                    {rejectMutation.isPending ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <X size={14} />
                    )}
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-20 bg-white rounded-[2.5rem] sm:rounded-[3rem] border border-dashed border-slate-200 flex flex-col items-center justify-center gap-3 px-4">
            <AlertTriangle size={36} className="text-slate-300" />
            <p className="font-black text-slate-300 uppercase tracking-widest text-xs sm:text-sm">
              No tutors have applied to this post yet
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ViewApplicants;

    // payment history

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

    // 🔄 ১. নতুন বুকমার্ক এড করার এপিআই
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

    // 🔄 ২. নির্দিষ্ট ইউজারের সব বুকমার্ক করা পোস্ট খুঁজে আনার এপিআই
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

    // 🔄 ৩. বুকমার্ক রিমুভ/ডিলিট করার এপিআই
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
