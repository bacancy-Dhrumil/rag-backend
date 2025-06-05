const { OpenAIEmbeddings } = require("@langchain/openai");
const { ChatOpenAI } = require("@langchain/openai");
const { ChromaClient } = require('chromadb');
const { Course, ChatHistory } = require('../db/models');
const { v4: uuidv4 } = require('uuid');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

class RAGChain {
  constructor() {
    this.embeddings = new OpenAIEmbeddings();
    this.chromaClient = new ChromaClient({
      path: `http://${process.env.CHROMA_HOST || 'localhost'}:${process.env.CHROMA_PORT || 8000}`
    });
    this.collection = null;
    this.chatModel = new ChatOpenAI({
      modelName: "gpt-3.5-turbo",
      temperature: 0.6
    });
    this.initializeVectorStore();
  }

  async initializeVectorStore() {
    try {
      // Create or get the collection
      this.collection = await this.chromaClient.getOrCreateCollection({
        name: 'course_transcripts'
      });
      console.log('Vector store initialized successfully');
      
      // Process any pending transcripts
      await this.processPendingTranscripts();
    } catch (error) {
      console.error('Error initializing vector store:', error);
      throw error;
    }
  }

  async processPendingTranscripts() {
    try {
      const pendingCourses = await Course.findAll({
        where: {
          processingStatus: ['pending', 'failed']
        }
      });

      for (const course of pendingCourses) {
        try {
          await this.processTranscript(course);
        } catch (error) {
          console.error(`Error processing transcript for course ${course.id}:`, error);
          await course.update({ processingStatus: 'failed' });
        }
      }
    } catch (error) {
      console.error('Error processing pending transcripts:', error);
    }
  }

  async processTranscript(course) {
    try {
      await course.update({ processingStatus: 'processing' });

      // Split and store in Chroma
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const chunks = await splitter.createDocuments([course.transcript]);
      
      // Add metadata to each chunk
      const documents = chunks.map(chunk => ({
        pageContent: chunk.pageContent,
        metadata: {
          ...course.metadata,
          courseId: course.id,
          chunkId: uuidv4()
        }
      }));

      // Add documents to Chroma
      await this.collection.add({
        ids: documents.map(doc => doc.metadata.chunkId),
        documents: documents.map(doc => doc.pageContent),
        metadatas: documents.map(doc => doc.metadata)
      });
      
      await course.update({
        processingStatus: 'completed',
        chromaProcessedAt: new Date()
      });
    } catch (error) {
      await course.update({ processingStatus: 'failed' });
      throw error;
    }
  }

  async addTranscript(transcript, metadata = {}) {
    try {
      // Generate a unique ID for the course
      const courseId = uuidv4();

      // Store transcript in MySQL
      const course = await Course.create({
        id: courseId,
        transcript,
        metadata,
        title: metadata.title || 'Untitled Course',
        processingStatus: 'pending'
      });

      // Process the transcript
      await this.processTranscript(course);

      return courseId;
    } catch (error) {
      console.error('Error adding transcript:', error);
      throw error;
    }
  }

  async query(question, courseId) {
    try {
      console.log('Starting query process:', { question, courseId });

      // Check if course is processed
      const course = await Course.findByPk(courseId);
      if (!course) {
        throw new Error('Course not found');
      }

      if (course.processingStatus !== 'completed') {
        throw new Error('Course is still being processed');
      }

      // Get relevant documents from Chroma
      const results = await this.collection.query({
        queryTexts: [question],
        nResults: 3,  // Get more chunks for better context
        where: { courseId }
      });

      // Store the question in chat history
      await ChatHistory.create({
        courseId,
        role: 'human',
        content: question
      });

      // If no relevant documents found
      if (!results.documents[0] || results.documents[0].length === 0) {
        console.log('No relevant documents found in transcript');
        const response = `I can only answer questions about the topics covered in this course.`;
        await ChatHistory.create({
          courseId,
          role: 'ai',
          content: response
        });
        return response;
      }

      // Combine all relevant content
      const context = results.documents[0].join('\n\n');
      
      // Let LLM handle both general interactions and specific questions
      const prompt = `You are a friendly teaching assistant. Your role is to help students understand what topics are covered in this course and answer questions about those topics.

      Course Content:
      ${context}

      Student's Message: ${question}

      Your task:
      1. First, understand what the student is asking:
         - Are they asking if a specific topic is covered?
         - Are they asking about a specific topic?
         - Are they asking about something not in the course?

      2. Then respond appropriately:
         - For questions about course coverage: Check if the topic is mentioned in the course content and clearly state whether it's covered
         - For questions about covered topics: Answer using only the course content
         - For questions about other topics: Politely explain you can only help with course topics

      3. Important rules:
         - Only use information from the course content
         - Don't make connections to topics not mentioned
         - Provide clear and helpful responses
         - Be friendly and natural in your tone`;

      const aiResponse = await this.chatModel.invoke(prompt);
      let response = aiResponse.content;

      // Clean up the response
      response = response
        .replace(/^Response:\s*/i, '')  // Remove "Response:" prefix
        .replace(/^Answer:\s*/i, '')    // Remove "Answer:" prefix
        .replace(/^AI:\s*/i, '')        // Remove "AI:" prefix
        .trim();                        // Remove extra whitespace
      
      await ChatHistory.create({
        courseId,
        role: 'ai',
        content: response
      });
      return response;
    } catch (error) {
      console.error('Error in query process:', error);
      throw error;
    }
  }

  async getChatHistory(courseId) {
    try {
      const history = await ChatHistory.findAll({
        where: { courseId },
        order: [['timestamp', 'ASC']]
      });
      return history;
    } catch (error) {
      console.error('Error getting chat history:', error);
      throw error;
    }
  }

  async getProcessingStatus(courseId) {
    try {
      const course = await Course.findByPk(courseId);
      if (!course) {
        throw new Error('Course not found');
      }
      return {
        status: course.processingStatus,
        processedAt: course.chromaProcessedAt
      };
    } catch (error) {
      console.error('Error getting processing status:', error);
      throw error;
    }
  }
}

async function initRAGChainForTranscript(transcriptText, courseId) {
  try {
    // Create a new RAGChain instance
    const ragChain = new RAGChain();
    
    // Add transcript to database and process it
    await ragChain.addTranscript(transcriptText, {
      courseId,
      title: `Course ${courseId}`,
      dateAdded: new Date().toISOString()
    });
    
    return ragChain;
  } catch (error) {
    console.error('Error initializing RAG chain:', error);
    throw error;
  }
}

async function askQuestion(courseId, question, chatHistory = []) {
  try {
    const ragChain = new RAGChain();
    return await ragChain.query(question, courseId);
  } catch (error) {
    console.error('Error asking question:', error);
    throw error;
  }
}

module.exports = { RAGChain, initRAGChainForTranscript, askQuestion };
