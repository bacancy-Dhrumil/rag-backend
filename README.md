# RAG Chatbot Backend

This is the backend for a Retrieval-Augmented Generation (RAG) chatbot using Node.js, Express, and ChromaDB.

## Features
- RAG chain for document retrieval and chat
- Uses ChromaDB (local SQLite by default)
- Sequelize ORM for relational data

## Prerequisites
- Node.js (v18+ recommended)
- npm

## Setup
1. **Clone the repository:**
   ```sh
   git clone <your-repo-url>
   cd backend
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Configure environment variables:**
   - Create a `.env` file in the project root with the following keys:
     ```env
     OPENAI_API_KEY=your-openai-api-key
     DB_NAME=your-database-name
     DB_USER=your-database-username
     DB_PASSWORD=your-database-password
     DB_HOST=your-database-host
     ```

## Database Setup
- The ChromaDB database (`chroma_db/chroma.sqlite3`) is **not included** in the repository.
- To generate it:
  1. Make sure your source data is available (e.g., in `data/`).
  2. Run your ingestion or setup scripts (e.g., `node initDb.js` or use the app's endpoints to add data).
  3. The database file will be created automatically.
- To run a local ChromaDB server using your database path, use:
  ```sh
  chroma run --path ./chroma_db
  ```

## Scripts
- `node initDb.js` — Initialize the relational database (if needed)
- `node testDb.js` — Test database and RAG chain functionality
- `node checkChroma.js` — Inspect ChromaDB collections

## Running the Server
```sh
node server.js
```

## Notes
- The `chroma_db/chroma.sqlite3` file is ignored by git. Each environment should generate its own database file.
- For production, ensure you use secure environment variables and review your data ingestion process.

## License
ISC 