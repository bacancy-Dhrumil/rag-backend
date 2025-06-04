const { Course, ChatHistory } = require('./db/models');
const { RAGChain } = require('./chains/ragChain');

async function testDatabase() {
    try {
        // Test creating a course
        console.log('Creating test course...');
        const ragChain = new RAGChain();
        
        const testTranscript = "This is a test course about JavaScript. JavaScript is a programming language that enables interactive web pages.";
        const courseId = await ragChain.addTranscript(testTranscript, {
            title: 'Test JavaScript Course',
            dateAdded: new Date().toISOString()
        });
        
        console.log('Course created with ID:', courseId);
        
        // Verify course exists
        const course = await Course.findByPk(courseId);
        console.log('Course found in database:', course ? 'Yes' : 'No');
        if (course) {
            console.log('Course details:', {
                id: course.id,
                title: course.title,
                status: course.processingStatus,
                createdAt: course.createdAt
            });
        }
        
        // Check processing status
        const status = await ragChain.getProcessingStatus(courseId);
        console.log('Processing status:', status);
        
    } catch (error) {
        console.error('Error during test:', error);
    }
}

testDatabase(); 