const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');

class SessionService {
    constructor() {
        this.sessions = new Map();
        this.drugsData = null;
        this.questionsData = null;
        this.dataLoaded = false;
        this.loadData();
    }

    /**
     * Load drug and question data from JSON files
     */
    async loadData() {
        try {
            const drugsPath = path.join(__dirname, '../data/drugs.json');
            const questionsPath = path.join(__dirname, '../data/questions.json');
            
            this.drugsData = await fs.readJson(drugsPath);
            this.questionsData = await fs.readJson(questionsPath);
            this.dataLoaded = true;
        } catch (error) {
            console.error('Error loading data:', error);
            throw new Error('Failed to load drug and question data');
        }
    }

    /**
     * Create a new session
     * @returns {string} - Session ID
     */
    createSession() {
        const sessionId = uuidv4();
        const session = {
            id: sessionId,
            createdAt: new Date(),
            status: 'active',
            step: 'greeting',
            memberName: null,
            dateOfBirth: null,
            drugName: null,
            drugId: null,
            currentQuestionId: null,
            answers: {},
            questionFlow: [],
            currentQuestionIndex: 0,
            decision: null,
            decisionReason: null
        };

        this.sessions.set(sessionId, session);
        return sessionId;
    }

    /**
     * Get session by ID
     * @param {string} sessionId - Session identifier
     * @returns {Object|null} - Session object or null if not found
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Update session data
     * @param {string} sessionId - Session identifier
     * @param {Object} updates - Data to update
     */
    updateSession(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        if (session) {
            Object.assign(session, updates);
            session.updatedAt = new Date();
        }
    }

    /**
     * Find drug by name or common names
     * @param {string} drugName - Drug name to search for
     * @returns {Object|null} - Drug object or null if not found
     */
    findDrug(drugName) {
        if (!this.drugsData || !this.dataLoaded) return null;

        const searchTerm = drugName.toLowerCase().trim();
        
        return this.drugsData.drugs.find(drug => {
            return drug.name.toLowerCase() === searchTerm ||
                   drug.genericName.toLowerCase() === searchTerm ||
                   drug.commonNames.some(name => name.toLowerCase() === searchTerm);
        });
    }

    /**
     * Get question set for a drug
     * @param {string} questionSetId - Question set identifier
     * @returns {Object|null} - Question set or null if not found
     */
    getQuestionSet(questionSetId) {
        if (!this.questionsData) return null;
        return this.questionsData.questionSets[questionSetId] || null;
    }

    /**
     * Initialize question flow for a session
     * @param {string} sessionId - Session identifier
     * @param {string} drugId - Drug identifier
     */
    initializeQuestionFlow(sessionId, drugId) {
        const session = this.getSession(sessionId);
        const drug = this.drugsData.drugs.find(d => d.id === drugId);
        
        if (!session || !drug) return;

        const questionSet = this.getQuestionSet(drug.questionSet);
        if (!questionSet) return;

        session.drugId = drugId;
        session.questionFlow = questionSet.questions;
        session.currentQuestionIndex = 0;
        session.step = 'question_flow';
        
        this.updateSession(sessionId, session);
    }

    /**
     * Get current question for a session
     * @param {string} sessionId - Session identifier
     * @returns {Object|null} - Current question or null if no more questions
     */
    getCurrentQuestion(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || session.currentQuestionIndex >= session.questionFlow.length) {
            return null;
        }

        return session.questionFlow[session.currentQuestionIndex];
    }

    /**
     * Process answer and move to next question
     * @param {string} sessionId - Session identifier
     * @param {string} answer - User's answer
     * @returns {Object} - Next step information
     */
    processAnswer(sessionId, answer) {
        const session = this.getSession(sessionId);
        if (!session) return { action: 'error', message: 'Session not found' };

        const currentQuestion = this.getCurrentQuestion(sessionId);
        if (!currentQuestion) return { action: 'complete', decision: session.decision };

        // Store the answer
        session.answers[currentQuestion.id] = answer;

        // Determine next step based on question type and answer
        const nextStep = this.determineNextStep(currentQuestion, answer);
        
        if (nextStep === 'approve' || nextStep === 'deny' || nextStep === 'documentation_required') {
            session.decision = nextStep;
            session.step = 'complete';
            session.decisionReason = this.getDecisionReason(currentQuestion, answer);
            return { action: 'complete', decision: nextStep, reason: session.decisionReason };
        }

        // Move to next question
        session.currentQuestionIndex++;
        this.updateSession(sessionId, session);

        return { action: 'next_question', question: this.getCurrentQuestion(sessionId) };
    }

    /**
     * Determine next step based on question and answer
     * @param {Object} question - Current question
     * @param {string} answer - User's answer
     * @returns {string} - Next step identifier
     */
    determineNextStep(question, answer) {
        if (question.type === 'multiple_choice') {
            return question.next[answer] || question.next.default || 'next';
        } else if (question.type === 'yes_no') {
            const normalizedAnswer = answer.toLowerCase().trim();
            if (normalizedAnswer === 'yes' || normalizedAnswer === 'y') {
                return question.next.yes || 'next';
            } else if (normalizedAnswer === 'no' || normalizedAnswer === 'n') {
                return question.next.no || 'next';
            }
        } else if (question.type === 'numeric') {
            const numValue = parseFloat(answer);
            if (!isNaN(numValue) && question.next.range) {
                const range = question.next.range;
                if (numValue >= range.min && numValue <= range.max) {
                    return range.next;
                }
            }
            return question.next.default || 'next';
        }

        return 'next';
    }

    /**
     * Get decision reason for approval/denial
     * @param {Object} question - Current question
     * @param {string} answer - User's answer
     * @returns {string} - Decision reason
     */
    getDecisionReason(question, answer) {
        if (question.type === 'multiple_choice') {
            if (answer === 'Type 1 Diabetes') {
                return 'GLP-1 receptor agonists are not indicated for Type 1 Diabetes';
            } else if (answer === 'Other') {
                return 'Indication not covered under current authorization criteria';
            }
        } else if (question.type === 'yes_no') {
            const normalizedAnswer = answer.toLowerCase().trim();
            if (normalizedAnswer === 'yes' || normalizedAnswer === 'y') {
                if (question.id === 'contraindications') {
                    return 'Patient has contraindications to therapy';
                }
            } else if (normalizedAnswer === 'no' || normalizedAnswer === 'n') {
                if (question.id === 'step_1_required') {
                    return 'Patient has not tried required step 1 medications';
                } else if (question.id === 'conventional_therapy') {
                    return 'Patient has not tried conventional therapy';
                }
            }
        }

        return 'Based on clinical criteria evaluation';
    }

    /**
     * Get session summary
     * @param {string} sessionId - Session identifier
     * @returns {Object} - Session summary
     */
    getSessionSummary(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) return null;

        return {
            id: session.id,
            status: session.status,
            step: session.step,
            memberName: session.memberName,
            dateOfBirth: session.dateOfBirth,
            drugName: session.drugName,
            decision: session.decision,
            decisionReason: session.decisionReason,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
        };
    }

    /**
     * End session
     * @param {string} sessionId - Session identifier
     */
    endSession(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            session.status = 'completed';
            session.endedAt = new Date();
            this.updateSession(sessionId, session);
        }
    }

    /**
     * Get all active sessions
     * @returns {Array} - Array of active sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.values())
            .filter(session => session.status === 'active')
            .map(session => this.getSessionSummary(session.id));
    }

    /**
     * Clean up old sessions
     * @param {number} maxAge - Maximum age in hours
     */
    cleanupOldSessions(maxAge = 24) {
        const cutoff = new Date(Date.now() - maxAge * 60 * 60 * 1000);
        
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.createdAt < cutoff) {
                this.sessions.delete(sessionId);
            }
        }
    }
}

module.exports = new SessionService(); 