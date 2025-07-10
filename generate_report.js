#!/usr/bin/env node

const authService = require('./services/authService');
const sessionService = require('./services/sessionService');
const fs = require('fs-extra');
const path = require('path');

async function generateSampleReport() {
    console.log('📋 Generating Sample Authorization Report...\n');
    
    try {
        // Wait for data to load
        while (!sessionService.dataLoaded) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Create a sample session
        const sessionId = sessionService.createSession();
        console.log(`✅ Session created: ${sessionId}`);
        
        // Set up patient and drug info
        const drug = sessionService.findDrug('ozempic');
        sessionService.initializeQuestionFlow(sessionId, drug.id);
        sessionService.updateSession(sessionId, {
            drugName: drug.name,
            memberName: 'Jane Smith',
            dateOfBirth: '1975-06-15'
        });
        
        console.log(`✅ Drug selected: ${drug.name}`);
        console.log(`✅ Patient: Jane Smith (DOB: 1975-06-15)`);
        
        // Simulate a complete authorization flow
        const answers = [
            'Type 2 Diabetes',           // diagnosis
            '8.5',                       // a1c_level
            'yes',                       // current_medications
            'metformin and glipizide',   // list_medications
            'yes',                       // step_1_required
            'Patient failed metformin due to gastrointestinal side effects and glipizide due to hypoglycemia', // step_1_failure
            'no'                         // contraindications
        ];
        
        console.log('\n📝 Processing answers...');
        for (let i = 0; i < answers.length; i++) {
            const result = sessionService.processAnswer(sessionId, answers[i]);
            console.log(`   Q${i + 1}: "${answers[i]}" -> ${result.action}`);
            
            if (result.action === 'complete') {
                console.log(`   ✅ Decision: ${result.decision}`);
                break;
            }
        }
        
        // Generate the report
        console.log('\n📊 Generating authorization report...');
        const report = authService.generateReport(sessionId);
        
        // Save report to file
        const reportPath = path.join(process.cwd(), `auth-report-${sessionId}.json`);
        await fs.writeJson(reportPath, report, { spaces: 2 });
        
        console.log(`✅ Report saved: ${reportPath}`);
        console.log(`📋 Report ID: ${report.reportId}`);
        console.log(`👤 Patient: ${report.summary.memberName}`);
        console.log(`💊 Drug: ${report.summary.drugName}`);
        console.log(`📋 Decision: ${report.summary.decision.toUpperCase()}`);
        console.log(`❓ Questions answered: ${report.questionResponses.length}`);
        console.log(`💡 Recommendations: ${report.recommendations.length}`);
        
        console.log('\n📄 Report Summary:');
        console.log(`   - Member: ${report.summary.memberName}`);
        console.log(`   - Drug: ${report.summary.drugName} (${report.summary.drugCategory.category})`);
        console.log(`   - Decision: ${report.summary.decision}`);
        console.log(`   - Reason: ${report.summary.decisionReason}`);
        
        console.log('\n🎯 Clinical Criteria Assessment:');
        Object.entries(report.clinicalCriteria).forEach(([criterion, data]) => {
            if (data) {
                console.log(`   - ${criterion}: ${data.value} (${data.met ? '✅ Met' : '❌ Not Met'})`);
            }
        });
        
        console.log('\n💡 Recommendations:');
        report.recommendations.forEach((rec, index) => {
            console.log(`   ${index + 1}. ${rec.message} (${rec.priority} priority)`);
        });
        
        console.log(`\n📁 Full report available at: ${reportPath}`);
        
    } catch (error) {
        console.error('❌ Error generating report:', error.message);
        process.exit(1);
    }
}

// Run the report generation
generateSampleReport(); 