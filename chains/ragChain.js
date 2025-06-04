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
      // Handle general greetings and non-course questions
      const generalGreetings = ['hello', 'hi', 'hey', 'hii', 'hiii', 'greetings', 'good morning', 'good afternoon', 'good evening'];
      const lowerQuestion = question.toLowerCase().trim();
      
      // Check if the question is a greeting (including variations)
      if (generalGreetings.some(greeting => lowerQuestion.includes(greeting))) {
        const response = "Hello! I'm your course assistant. How can I help you with the course material today?";
        await ChatHistory.create({
          courseId,
          role: 'ai',
          content: response
        });
        return response;
      }

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
        nResults: 5,
        where: { courseId }
      });

      // Store the question in chat history
      await ChatHistory.create({
        courseId,
        role: 'human',
        content: question
      });

      // If no relevant documents found or relevance score is too low, provide a topic-specific response
      if (!results.documents[0] || results.documents[0].length === 0 || 
          (results.distances && results.distances[0] && results.distances[0][0] > 0.8)) {
        const response = "I apologize, but I can only answer questions about the course material, which is the topic of this course. Your question seems to be about a different topic. Could you please ask a question related to the course material?";
        await ChatHistory.create({
          courseId,
          role: 'ai',
          content: response
        });
        return response;
      }

      // Combine all relevant context
      const context = results.documents[0].join('\n\n');

      // Generate a better response using ChatOpenAI
      const prompt = `You are a teaching assistant for a course about ${course.metadata.title || 'the course material'}. 
      Only answer questions related to ${course.metadata.title || 'the course material'}.
      If the question is not about ${course.metadata.title || 'the course material'}, respond with: "I apologize, but I can only answer questions about ${course.metadata.title || 'the course material'}, which is the topic of this course. Your question seems to be about a different topic. Could you please ask a question related to ${course.metadata.title || 'the course material'}?"

      Based on the following course content, please provide a clear, concise, and comprehensive answer to the question. 
      Focus on the most relevant information and present it in a well-structured way.

      Course Content:
      ${context}

      Question: ${question}

      Please provide a detailed answer that:
      1. Directly addresses the question
      2. Includes key concepts and definitions
      3. Explains important processes or relationships
      4. Uses clear, academic language
      5. Is well-structured and easy to understand`;

      const aiResponse = await this.chatModel.invoke(prompt);
      
      // Extract just the content from the AIMessage
      const response = aiResponse.content;

      // Store the response in chat history
      await ChatHistory.create({
        courseId,
        role: 'ai',
        content: response
      });

      return response;
    } catch (error) {
      console.error('Error querying:', error);
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
