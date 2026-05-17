import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { db, collection, addDoc, query, where, getDocs, serverTimestamp, updateDoc, doc, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import './LiveChat.css';

export default function LiveChat() {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize or load existing chat session
  useEffect(() => {
    loadOrCreateSession();
  }, [user]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadOrCreateSession() {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'support_chats'),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const chat = snap.docs[snap.docs.length - 1].data();
        setSessionId(snap.docs[snap.docs.length - 1].id);
        setMessages(chat.messages || []);
      } else {
        // Create new session
        const docRef = await addDoc(collection(db, 'support_chats'), {
          userId: user.uid,
          userEmail: user.email,
          messages: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'open'
        });
        setSessionId(docRef.id);
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to load chat session:', e);
    }
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    if (!inputValue.trim() || loading) return;

    const messageContent = inputValue; // Capture value before state update
    const userMessage = { role: 'user', content: messageContent, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Call Claude API via secure Cloud Function
      const callClaudeAPI = httpsCallable(functions, 'callClaudeAPI');
      const result = await callClaudeAPI({
        mode: 'chat',
        message: messageContent,
        sessionId: sessionId
      });

      const assistantMessage = {
        role: 'assistant',
        content: result.data.message,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Messages are already saved by Cloud Function, but update local state
      if (sessionId) {
        const chatSnap = await getDocs(query(
          collection(db, 'support_chats'),
          where('userId', '==', user.uid)
        ));
        if (!chatSnap.empty) {
          const chat = chatSnap.docs[chatSnap.docs.length - 1].data();
          setMessages(chat.messages || []);
        }
      }
    } catch (error) {
      console.error('Failed to get response:', error);

      let errorContent = 'Sorry, I encountered an error. ';
      if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorContent += 'Please check your internet connection and try again.';
      } else if (error.message?.includes('unauthenticated')) {
        errorContent += 'Please sign in to use the chat feature.';
      } else if (error.message?.includes('resource-exhausted')) {
        errorContent += 'Too many requests. Please wait a moment and try again.';
      } else if (error.message?.includes('timeout')) {
        errorContent += 'The request took too long. Please try again with a shorter message.';
      } else {
        errorContent += 'Please try again or contact support@irema.app for assistance.';
      }

      const errorMessage = {
        role: 'assistant',
        content: errorContent,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`livechat-fab${isOpen ? ' livechat-fab-open' : ''}`}
        title="Support Agent - Chat with us!"
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Robot head */}
          <rect x="6" y="8" width="20" height="16" rx="2" fill="white" stroke="white" strokeWidth="1.5"/>
          {/* Left eye */}
          <circle cx="11" cy="12" r="2.5" fill="#2d8f6f"/>
          {/* Right eye */}
          <circle cx="21" cy="12" r="2.5" fill="#2d8f6f"/>
          {/* Antenna left */}
          <rect x="10" y="2" width="1.5" height="6" fill="white"/>
          <circle cx="10.75" cy="1.5" r="1.2" fill="white"/>
          {/* Antenna right */}
          <rect x="21.5" y="2" width="1.5" height="6" fill="white"/>
          <circle cx="22.25" cy="1.5" r="1.2" fill="white"/>
          {/* Mouth */}
          <path d="M 12 16 Q 16 18 20 16" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="livechat-panel">
          {/* Header */}
          <div
            style={{
              padding: 16,
              borderBottom: '1px solid var(--border)',
              background: 'var(--brand)',
              color: 'white',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Support Agent</h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '1.2rem'
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--text-3)',
                  marginTop: 16
                }}
              >
                <p>Welcome! How can I help you today?</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background:
                      msg.role === 'user'
                        ? 'var(--brand)'
                        : 'var(--bg)',
                    color: msg.role === 'user' ? 'white' : 'var(--text-1)',
                    fontSize: '0.9rem',
                    wordWrap: 'break-word'
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                <span style={{ fontSize: '0.8rem' }}>Agent is typing...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSendMessage}
            style={{
              display: 'flex',
              gap: 8,
              padding: 12,
              borderTop: '1px solid var(--border)',
              background: 'var(--surface)'
            }}
          >
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Type a message..."
              disabled={loading}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                background: 'var(--bg)',
                color: 'var(--text-1)'
              }}
            />
            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              style={{
                padding: '8px 14px',
                background: 'var(--brand)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                opacity: loading || !inputValue.trim() ? 0.5 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
