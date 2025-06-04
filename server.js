require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { RAGChain } = require("./chains/ragChain");

const app = express();
const PORT = process.env.PORT || 3001;

// Simple CORS setup
app.use(cors());
app.use(bodyParser.json());

// Initialize RAGChain instance
const ragChain = new RAGChain();

// Simple GET route to test server is running
app.get("/", (req, res) => {
  res.send("RAG chatbot backend is running");
});

// Upload transcript and initialize RAG chain
app.post("/uploadTranscript", async (req, res) => {
  try {
    const { transcriptText, courseId } = req.body;
    if (!transcriptText || !courseId) {
      return res.status(400).json({ error: "Missing transcriptText or courseId" });
    }

    const newCourseId = await ragChain.addTranscript(transcriptText, {
      courseId,
      title: `Course ${courseId}`,
      dateAdded: new Date().toISOString()
    });
    
    res.json({ 
      message: "Transcript uploaded successfully",
      courseId: newCourseId
    });
  } catch (err) {
    console.error("Error uploading transcript:", err);
    res.status(500).json({ error: err.message });
  }
});

// Chat endpoint: ask question for given courseId
app.post("/chat", async (req, res) => {
  try {
    const { question, courseId } = req.body;
    if (!question || !courseId) {
      return res.status(400).json({ error: "Missing question or courseId" });
    }

    const answer = await ragChain.query(question, courseId);
    res.json({ answer });
  } catch (err) {
    console.error("Error in chat:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get chat history for a course
app.get("/history/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const history = await ragChain.getChatHistory(courseId);
    res.json({ history });
  } catch (err) {
    console.error("Error getting chat history:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get processing status for a course
app.get("/status/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const status = await ragChain.getProcessingStatus(courseId);
    res.json(status);
  } catch (err) {
    console.error("Error getting status:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`RAG chatbot backend running on http://localhost:${PORT}`);
}); 