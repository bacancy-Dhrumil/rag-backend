const { ChromaClient } = require('chromadb');

async function checkChroma() {
    try {
        const client = new ChromaClient();
        
        // Get all collections
        const collections = await client.listCollections();
        console.log('Collections:', collections);

        // For each collection, get its contents
        for (const collection of collections) {
            console.log(`\nCollection: ${collection.name}`);
            const result = await collection.get();
            console.log('Documents:', result);
        }
    } catch (error) {
        console.error('Error checking Chroma:', error);
    }
}

checkChroma(); 