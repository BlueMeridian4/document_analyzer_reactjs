// ==========================
// BACKEND: server/index.js (FIXED)
// ==========================
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import {
  insertDocument,
  updateDocument,
  getAllDocuments
} from "./db.js";

const app = express();
app.use(cors());
app.use(fileUpload());
app.use(express.json());

// Ensure uploads folder exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---------------------------
// GET ALL DOCUMENTS
// ---------------------------
app.get("/documents", (req, res) => {
  try {
    res.json(getAllDocuments());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------
// Analyze File
// ---------------------------
app.post("/analyze", async (req, res) => {
  try {
    if (!req.files?.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploaded = req.files.file;

    const tempPath = path.join("uploads", uploaded.name);
    await uploaded.mv(tempPath);

    // Insert into DB
    const docId = insertDocument({
      name: uploaded.name,
      timestamp: new Date().toISOString(),
      status: "Processing"
    });

    // --------------------------------------------------
    // 1️⃣ Upload file to OpenAI
    // --------------------------------------------------
    const uploadedFile = await client.files.create({
      file: fs.createReadStream(tempPath),
      purpose: "assistants"
    });

    // --------------------------------------------------
    // 2️⃣ Create Response referencing file_id
    // --------------------------------------------------
    const response = await client.responses.create({
      model: "gpt-4.1",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze this document and return JSON with: summary, key_topics, document_type."
            },
            {
              type: "input_file",
              file_id: uploadedFile.id
            }
          ]
        }
      ]
    });

    // Delete temp file
    fs.unlinkSync(tempPath);

    // --------------------------------------------------
    // 3️⃣ Extract the text result safely
    // --------------------------------------------------
    const text = response.output_text || "";

    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        summary: text,
        key_topics: [],
        document_type: "Unknown"
      };
    }

    // --------------------------------------------------
    // 4️⃣ Update DB
    // --------------------------------------------------
    updateDocument(docId, {
      status: "Complete",
      summary: data.summary ?? null,
      topics: data.key_topics ?? [],
      docType: data.document_type ?? "",
      tokens: response.usage ?? null,
      error: null
    });

    // --------------------------------------------------
    // 5️⃣ Return to frontend
    // --------------------------------------------------
    return res.json({
      id: docId,
      summary: data.summary,
      topics: data.key_topics,
      docType: data.document_type,
      tokens: response.usage
    });

  } catch (err) {
    console.error("❌ AI processing error:", err);

    return res.status(500).json({
      error: err.message || "Unknown error"
    });
  }
});

app.listen(3001, () =>
  console.log("Server running on http://localhost:3001")
);
