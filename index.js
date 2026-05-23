import {createRequire} from "module";
const require = createRequire(import.meta.url)
import dns from "node:dns";
dns.setServers(['8.8.8.8', '1.1.1.1']);

const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const cors = require("cors");
require('dotenv').config();
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

    const db = client.db('etuitionbd_db');
    const usersCollection = db.collection('users');


    app.get('/api/users', async(req, res)=>{
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result)
    });

    app.post('/api/users', async(req, res)=>{
      const user = req.body;
      const query = { _id: user._id }
      const existingUser = await usersCollection.findOne(query);

      if(existingUser){
        return res.status(400).send({message: 'user already exists in database'})
      }
        const result = await usersCollection.insertOne(user);
        res.send(result)
      
    })

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
