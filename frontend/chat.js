class TriageChat {
    constructor() {
        this.transcript = [];
        this.sessionId = this.generateSessionId();
        this.fieldsCollected = {
            problem: false,
            domain: false,
            urgency: false,
            obstacles: false,
            contact: false
        };
        this.messageCount = 0;
        this.lastActivity = Date.now();
        this.hasSubmitted = false;
        
        this.initializeElements();
        this.attachEventListeners();
        this.setupPageExitHandlers();
        this.updateProgress();
        
        this.addMessage('ai', 'What\'s broken? I need 5 things: what\'s fucked up, what system it\'s on, how urgent it is, what you\'ve tried, and how you want us to contact you.\n\nStart with what\'s not working.');
    }
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    initializeElements() {
        this.messagesContainer = document.getElementById('messages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.finishButton = document.getElementById('finishButton');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.progressFill = document.getElementById('progressFill');
    }
    
    attachEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.finishButton.addEventListener('click', () => this.finishChat());
        
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        this.messageInput.addEventListener('input', () => {
            this.autoResize();
            this.updateLastActivity();
        });
        
        this.messageInput.addEventListener('focus', () => {
            this.updateLastActivity();
        });
    }
    
    setupPageExitHandlers() {
        const submitOnExit = () => {
            if (!this.hasSubmitted && this.transcript.length > 0) {
                const data = JSON.stringify({
                    sessionId: this.sessionId,
                    transcript: this.transcript,
                    partial: true
                });
                navigator.sendBeacon('/submit', data);
            }
        };
        
        window.addEventListener('beforeunload', submitOnExit);
        window.addEventListener('pagehide', submitOnExit);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                submitOnExit();
            }
        });
    }
    
    autoResize() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    }
    
    updateLastActivity() {
        this.lastActivity = Date.now();
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.hasSubmitted) return;
        
        this.updateLastActivity();
        this.messageCount++;
        
        this.addMessage('user', message);
        this.messageInput.value = '';
        this.autoResize();
        this.showTyping();
        
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    message: message,
                    messageCount: this.messageCount
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            this.hideTyping();
            this.addMessage('ai', data.reply);
            
            if (data.fieldsUpdate) {
                this.fieldsCollected = { ...this.fieldsCollected, ...data.fieldsUpdate };
                this.updateProgress();
            }
            
            if (data.shouldFinish || data.reply.includes('[[WTFIYP_DONE]]')) {
                setTimeout(() => this.finishChat(), 1000);
            }
            
            if (!this.finishButton.style.display || this.finishButton.style.display === 'none') {
                this.finishButton.style.display = 'block';
                this.addMessage('system', 'Click "Fuck it, I\'m done" when you\'re ready to send this info.');
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.hideTyping();
            this.addMessage('system', 'Sorry, there was an error processing your message. Please try again.');
        }
    }
    
    async finishChat() {
        if (this.hasSubmitted) return;
        
        this.hasSubmitted = true;
        this.addMessage('system', 'Alright, sending this shit over...');
        
        try {
            const response = await fetch('/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    transcript: this.transcript,
                    partial: false
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.addMessage('system', '✅ Done. Your problem has been documented and sent.');
            this.messageInput.disabled = true;
            this.sendButton.disabled = true;
            this.finishButton.disabled = true;
            
        } catch (error) {
            console.error('Error submitting chat:', error);
            this.addMessage('system', 'Shit, something broke. Refresh and try again.');
            this.hasSubmitted = false;
        }
    }
    
    addMessage(type, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = content.replace('[[FIREBIRD_DONE]]', '');
        
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
        
        this.transcript.push({
            type: type,
            content: content.replace('[[FIREBIRD_DONE]]', ''),
            timestamp: new Date().toISOString()
        });
    }
    
    showTyping() {
        this.typingIndicator.style.display = 'flex';
        this.sendButton.disabled = true;
        this.scrollToBottom();
    }
    
    hideTyping() {
        this.typingIndicator.style.display = 'none';
        this.sendButton.disabled = false;
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 100);
    }
    
    updateProgress() {
        const collected = Object.values(this.fieldsCollected).filter(Boolean).length;
        const total = Object.keys(this.fieldsCollected).length;
        const percentage = (collected / total) * 100;
        
        this.progressFill.style.width = `${percentage}%`;
        
        if (percentage === 100) {
            this.progressFill.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.triageChat = new TriageChat();
});