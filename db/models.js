const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// Course model - stores course information and transcript
const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  transcript: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  processingStatus: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending',
  },
  chromaProcessedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  dateAdded: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
});

// ChatHistory model - stores conversation history
const ChatHistory = sequelize.define('ChatHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  courseId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('human', 'ai'),
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
});

// Set up relationships
Course.hasMany(ChatHistory, { foreignKey: 'courseId', sourceKey: 'id' });
ChatHistory.belongsTo(Course, { foreignKey: 'courseId', targetKey: 'id' });

// Function to initialize database tables
async function initializeDatabase() {
  try {
    await sequelize.sync();
    console.log('Database synchronized successfully');
  } catch (error) {
    console.error('Error synchronizing database:', error);
  }
}

module.exports = {
  Course,
  ChatHistory,
  initializeDatabase
}; 