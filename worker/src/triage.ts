import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';

export interface Env {
  AI: Ai;
  NOTIFY: SendEmail;
  TRIAGE_STATE: DurableObjectNamespace;
}

interface TriageMessage {
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: string;
}

interface TriageData {
  problem: boolean;
  domain: boolean;
  urgency: boolean;
  obstacles: boolean;
  contact: boolean;
}

export class TriageState {
  state: DurableObjectState;
  env: Env;
  transcript: TriageMessage[] = [];
  fieldsCollected: TriageData = {
    problem: false,
    domain: false,
    urgency: false,
    obstacles: false,
    contact: false
  };
  lastActivity: number = Date.now();
  emailed: boolean = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/transcript') {
      // Load from storage if not already loaded
      if (this.transcript.length === 0) {
        const storedTranscript = await this.state.storage.get<TriageMessage[]>('transcript');
        if (storedTranscript) {
          this.transcript = storedTranscript;
        }
      }
      
      return new Response(JSON.stringify({
        transcript: this.transcript,
        fieldsCollected: this.fieldsCollected,
        emailed: this.emailed
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/update' && request.method === 'POST') {
      const data = await request.json();
      
      if (data.transcript) {
        this.transcript = data.transcript;
      }
      
      this.lastActivity = Date.now();
      
      await this.state.storage.put('transcript', this.transcript);
      await this.state.storage.put('lastActivity', this.lastActivity);
      
      this.setAlarm();
      
      return new Response(JSON.stringify({ success: true }));
    }

    if (url.pathname === '/submit' && request.method === 'POST') {
      const data = await request.json();
      const emailed = await this.state.storage.get<boolean>('emailed') || false;
      
      if (emailed) {
        return new Response(JSON.stringify({ success: true, message: 'Already submitted' }));
      }
      
      this.transcript = data.transcript || this.transcript;
      await this.submitAndEmail(data.partial || false);
      
      return new Response(JSON.stringify({ success: true }));
    }

    return new Response('Not found', { status: 404 });
  }

  async setAlarm() {
    const alarmTime = Date.now() + 2 * 60 * 1000; // 2 minutes
    await this.state.storage.setAlarm(alarmTime);
  }

  async alarm() {
    const emailed = await this.state.storage.get<boolean>('emailed') || false;
    if (!emailed && this.transcript.length > 0) {
      await this.submitAndEmail(true);
    }
  }

  async submitAndEmail(partial: boolean) {
    const emailed = await this.state.storage.get<boolean>('emailed');
    if (emailed) return;

    try {
      const summary = await this.generateSummary(partial);
      const transcriptText = this.formatTranscript();
      
      await this.sendEmail(summary, transcriptText, partial);
      
      await this.state.storage.put('emailed', true);
      this.emailed = true;
    } catch (error) {
      console.error('Error in submitAndEmail:', error);
      throw error;
    }
  }

  async generateSummary(partial: boolean): Promise<string> {
    const conversationText = this.transcript
      .map(msg => `${msg.type}: ${msg.content}`)
      .join('\n');

    const prompt = `Analyze this triage conversation and create a concise summary with exactly 12 bullet points or fewer. Focus on the key technical details:

Conversation:
${conversationText}

Required fields to identify:
- Problem description
- Domain/system affected  
- Urgency level
- Obstacles/failed attempts
- Contact preferences

Format as bullet points (•). ${partial ? 'Mark as PARTIAL SUBMISSION if incomplete.' : ''}`;

    try {
      const response = await this.env.AI.run('@cf/google/gemma-3-12b-it', {
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 256
      });

      return response.response || 'Summary generation failed';
    } catch (error) {
      console.error('Summary generation error:', error);
      return `• ${partial ? 'PARTIAL SUBMISSION' : 'COMPLETE SUBMISSION'}\n• Technical issue reported\n• Details: ${conversationText.substring(0, 200)}...`;
    }
  }

  formatTranscript(): string {
    return this.transcript
      .map(msg => {
        const timestamp = new Date(msg.timestamp).toLocaleString();
        return `[${timestamp}] ${msg.type.toUpperCase()}: ${msg.content}`;
      })
      .join('\n\n');
  }

  async sendEmail(summary: string, transcriptText: string, partial: boolean) {
    const subject = partial ? 'WTFIYP - Incomplete Problem Report' : 'WTFIYP - Problem Report';
    
    const emailBody = `
WHAT THE FUCK IS YOUR PROBLEM - Problem Report
${partial ? '⚠️  INCOMPLETE - They bailed early' : '✅ COMPLETE - Got the full story'}

${summary}

---
FULL CONVERSATION:
${transcriptText.slice(0, 15000)}

Session completed: ${new Date().toLocaleString()}
    `.trim();
    
    // Create MIME message using proper Cloudflare format
    const msg = createMimeMessage();
    msg.setSender({ name: 'WTFIYP Bot', addr: 'contact@bytecrash.xyz' });
    msg.setRecipient('john.chris.smith@gmail.com');
    msg.setSubject(subject);
    msg.addMessage({
      contentType: 'text/plain',
      data: emailBody
    });
    
    // Send email via Cloudflare Email Routing
    const emailService = this.env?.NOTIFY;
    if (emailService) {
      try {
        const message = new EmailMessage(
          'contact@bytecrash.xyz',
          'john.chris.smith@gmail.com',
          msg.asRaw()
        );
        
        await emailService.send(message);
        console.log('Email sent successfully:', subject);
      } catch (error) {
        console.error('Email send error:', error);
        throw error;
      }
    } else {
      console.log('Email service not configured, would send:', { subject, summary: summary.substring(0, 100) });
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Serve static files
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(await getIndexHTML(), {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    if (url.pathname === '/chat.js') {
      return new Response(await getChatJS(), {
        headers: { 'Content-Type': 'application/javascript' }
      });
    }

    // Handle chat endpoint
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    // Handle submit endpoint
    if (url.pathname === '/submit' && request.method === 'POST') {
      return handleSubmit(request, env);
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    const { sessionId, message, messageCount } = await request.json();
    
    // Get or create Durable Object
    const id = env.TRIAGE_STATE.idFromName(sessionId);
    const state = env.TRIAGE_STATE.get(id);
    
    // Get current conversation state
    const stateResponse = await state.fetch(new Request('https://do.internal/transcript'));
    const currentState = await stateResponse.json();
    
    // Add user message to transcript
    const userMessage = {
      type: 'user' as const,
      content: message,
      timestamp: new Date().toISOString()
    };
    
    const updatedTranscript = [...currentState.transcript, userMessage];
    
    // Generate AI response with full conversation history
    const messages = [
      {
        role: 'system',
        content: `You are a no-bullshit problem intake system. Your job is to figure out what the fuck someone's problem is and gather the details. Be direct, slightly aggressive, but not mean.

GATHER INFORMATION about:
- What exactly is broken/fucked up
- What system/thing is affected 
- How urgent this shit is
- What they've already tried
- How to contact them

PERSONALITY:
- Be direct and no-nonsense 
- Use mild profanity but don't be abusive
- Cut through bullshit and get to the point
- Don't coddle people but don't be a dick
- When you have enough info, end with [[FIREBIRD_DONE]]
- Keep responses under 300 characters

${messageCount >= 10 ? 'FINAL MESSAGE: Wrap this shit up and end with [[FIREBIRD_DONE]]' : ''}`
      }
    ];
    
    // Add conversation history
    for (const msg of updatedTranscript) {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
    
    const aiResponse = await env.AI.run('@cf/google/gemma-3-12b-it', {
      messages: messages,
      temperature: 0.3,
      max_tokens: 300
    });
    
    let aiReply = aiResponse.response || 'I apologize, but I encountered an error. Could you please repeat your message?';
    
    // Check if we should terminate based on AI response or turn count
    const shouldFinish = shouldTerminate(messageCount, aiReply);
    
    if (shouldFinish && !aiReply.includes('[[FIREBIRD_DONE]]')) {
      aiReply += ' [[FIREBIRD_DONE]]';
    }
    
    // Add AI message to transcript
    const aiMessage = {
      type: 'ai' as const,
      content: aiReply,
      timestamp: new Date().toISOString()
    };
    
    const finalTranscript = [...updatedTranscript, aiMessage];
    
    // Update state
    await state.fetch(new Request('https://do.internal/update', {
      method: 'POST',
      body: JSON.stringify({
        transcript: finalTranscript
      }),
      headers: { 'Content-Type': 'application/json' }
    }));
    
    return new Response(JSON.stringify({
      reply: aiReply,
      shouldFinish
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in handleChat:', error);
    return new Response(JSON.stringify({ 
      reply: 'I apologize, but I encountered an error. Please try again.',
      error: true 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  try {
    const requestData = await request.json();
    const { sessionId } = requestData;
    
    const id = env.TRIAGE_STATE.idFromName(sessionId);
    const state = env.TRIAGE_STATE.get(id);
    
    const response = await state.fetch(new Request('https://do.internal/submit', {
      method: 'POST',
      body: JSON.stringify(requestData),
      headers: { 'Content-Type': 'application/json' }
    }));
    
    return response;
    
  } catch (error) {
    console.error('Error in handleSubmit:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to submit'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function shouldTerminate(messageCount: number, aiResponse: string): boolean {
  // Simple termination logic:
  // 1. AI explicitly signals done with [[FIREBIRD_DONE]]
  // 2. Conversation hits turn limit (10 exchanges)
  return aiResponse.includes('[[FIREBIRD_DONE]]') || messageCount >= 10;
}


// Serve the actual frontend files
async function getIndexHTML(): Promise<string> {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>What The Fuck Is Your Problem?</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 100vh; display: flex; align-items: center; justify-content: center; }
        .chat-container { background: white; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); width: 90%; max-width: 600px; height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
        .chat-header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .chat-header h1 { font-size: 1.5rem; margin-bottom: 5px; }
        .chat-header p { opacity: 0.8; font-size: 0.9rem; }
        .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .message { max-width: 80%; padding: 12px 16px; border-radius: 18px; line-height: 1.4; }
        .message.user { background: #007bff; color: white; align-self: flex-end; margin-left: auto; }
        .message.ai { background: #f1f3f4; color: #333; align-self: flex-start; }
        .message.system { background: #e8f5e8; color: #2d5a2d; align-self: center; font-size: 0.9rem; font-style: italic; text-align: center; border-radius: 12px; }
        .input-area { padding: 20px; border-top: 1px solid #eee; display: flex; gap: 10px; align-items: flex-end; }
        .input-container { flex: 1; position: relative; }
        #messageInput { width: 100%; padding: 12px 16px; border: 2px solid #e1e5e9; border-radius: 24px; font-size: 1rem; outline: none; resize: none; min-height: 48px; max-height: 120px; font-family: inherit; }
        #messageInput:focus { border-color: #007bff; }
        button { background: #007bff; color: white; border: none; border-radius: 50%; width: 48px; height: 48px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s; }
        button:hover:not(:disabled) { background: #0056b3; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        #finishButton { background: #28a745; border-radius: 24px; width: auto; padding: 12px 24px; margin-left: 10px; display: none; }
        #finishButton:hover:not(:disabled) { background: #1e7e34; }
        .typing-indicator { display: none; align-items: center; gap: 8px; color: #666; font-style: italic; padding: 12px 16px; }
        .typing-dots { display: flex; gap: 4px; }
        .typing-dots span { width: 6px; height: 6px; background: #666; border-radius: 50%; animation: typing 1.4s infinite ease-in-out; }
        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes typing { 0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
        .progress-bar { height: 4px; background: #e1e5e9; margin: 0 20px 10px 20px; border-radius: 2px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #28a745, #20c997); width: 0%; transition: width 0.3s ease; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>WHAT THE FUCK</h1>
            <p>IS YOUR PROBLEM?</p>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="messages" id="messages">
            <div class="message ai">Alright, I need to know what the fuck your problem is. Don't sugarcoat it, don't give me a fucking novel. Just tell me what's broken, what you've tried, and how urgent this shit is.<br><br>What's the problem?</div>
        </div>
        <div class="typing-indicator" id="typingIndicator">
            <span>Figuring out your bullshit</span>
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
        <div class="input-area">
            <div class="input-container">
                <textarea id="messageInput" placeholder="What's fucked up?" rows="1"></textarea>
            </div>
            <button id="sendButton" title="Send message">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
            </button>
            <button id="finishButton">Fuck it, I'm done</button>
        </div>
    </div>
    <script src="chat.js"></script>
</body>
</html>`;
}

async function getChatJS(): Promise<string> {
  return `
// Simplified version for embedded serving
class TriageChat {
  constructor() {
    this.transcript = [];
    this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.init();
  }
  
  init() {
    this.messagesEl = document.getElementById('messages');
    this.inputEl = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendButton');
    this.finishBtn = document.getElementById('finishButton');
    
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.finishBtn.addEventListener('click', () => this.finishChat());
    this.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
    
    // Initial message already in HTML
  }
  
  async sendMessage() {
    const message = this.inputEl.value.trim();
    if (!message) return;
    
    this.addMessage('user', message);
    this.inputEl.value = '';
    
    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, message, messageCount: this.transcript.filter(m => m.type === 'user').length })
      });
      
      const data = await response.json();
      this.addMessage('ai', data.reply.replace('[[FIREBIRD_DONE]]', ''));
      
      if (data.shouldFinish || data.reply.includes('[[FIREBIRD_DONE]]')) {
        setTimeout(() => this.finishChat(), 1000);
      }
      
      this.finishBtn.style.display = 'block';
    } catch (error) {
      this.addMessage('system', 'Error sending message. Please try again.');
    }
  }
  
  async finishChat() {
    try {
      await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, transcript: this.transcript })
      });
      this.addMessage('system', '✅ Thank you! Your information has been sent to our support team.');
    } catch (error) {
      this.addMessage('system', 'Error submitting. Please try again.');
    }
  }
  
  addMessage(type, content) {
    const div = document.createElement('div');
    div.className = 'message ' + type;
    div.textContent = content;
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    this.transcript.push({ type, content, timestamp: new Date().toISOString() });
  }
}

document.addEventListener('DOMContentLoaded', () => new TriageChat());
  `;
}

