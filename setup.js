#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

console.log('🚀 Voice Agent Demo Setup\n');

async function setup() {
    try {
        // Check if .env file exists
        const envPath = path.join(__dirname, '.env');
        const envExamplePath = path.join(__dirname, 'env.example');
        
        if (!await fs.pathExists(envPath)) {
            console.log('📝 Creating .env file from template...');
            await fs.copy(envExamplePath, envPath);
            console.log('✅ .env file created');
            console.log('⚠️  Please edit .env file and add your OpenAI API key');
        } else {
            console.log('✅ .env file already exists');
        }

        // Check if required directories exist
        const uploadsDir = path.join(__dirname, 'uploads');
        const tempDir = path.join(__dirname, 'temp');
        
        if (!await fs.pathExists(uploadsDir)) {
            console.log('📁 Creating uploads directory...');
            await fs.ensureDir(uploadsDir);
            console.log('✅ uploads directory created');
        } else {
            console.log('✅ uploads directory exists');
        }

        if (!await fs.pathExists(tempDir)) {
            console.log('📁 Creating temp directory...');
            await fs.ensureDir(tempDir);
            console.log('✅ temp directory created');
        } else {
            console.log('✅ temp directory exists');
        }

        // Check if data files exist
        const drugsPath = path.join(__dirname, 'data', 'drugs.json');
        const questionsPath = path.join(__dirname, 'data', 'questions.json');
        
        if (!await fs.pathExists(drugsPath)) {
            console.log('❌ data/drugs.json not found');
            return;
        }
        
        if (!await fs.pathExists(questionsPath)) {
            console.log('❌ data/questions.json not found');
            return;
        }

        console.log('✅ Data files found');

        // Run basic test
        console.log('\n🧪 Running basic functionality test...');
        const { runTests } = require('./test');
        await runTests();

        console.log('\n🎉 Setup complete!');
        console.log('\nNext steps:');
        console.log('1. Edit .env file and add your OpenAI API key');
        console.log('2. Run: npm start');
        console.log('3. Open http://localhost:3000 in your browser');
        console.log('4. Start a voice session and test the demo');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

setup(); 