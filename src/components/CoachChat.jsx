import React, { useState, useEffect, useRef } from 'react';
import databaseService, { isSupabaseConfigured } from '../services/databaseService';
import './CoachChat.css';

const CoachChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [clientId, setClientId] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Fetch User DB Profile on Mount to get UUID
  useEffect(() => {
    const initChat = async () => {
      const email = localStorage.getItem('userEmail') || '';
      const userName = localStorage.getItem('userName') || 'guest';
      
      let resolvedId = userName.toLowerCase().replace(/\s+/g, '');
      
      if (isSupabaseConfigured && email) {
        try {
          const profile = await databaseService.getUserProfileByEmail(email);
          if (profile && profile.id) {
            resolvedId = profile.id;
          }
        } catch (e) {
          console.error("Error retrieving client UUID for chat:", e);
        }
      }
      
      setClientId(resolvedId);
      
      // Load initial chat messages
      const chatHistory = await databaseService.getChatMessages(resolvedId);
      if (chatHistory.length > 0) {
        setMessages(chatHistory);
      } else {
        // Seed default chat messages if completely empty
        const welcomeSeed = [
          { id: 1, text: "Hey! How's the new meal plan feeling today?", sender: 'coach', time: '09:00 AM' },
          { id: 2, text: "Much better! The tofu swap really helped with the bloating.", sender: 'user', time: '10:15 AM' },
          { id: 3, text: "Awesome! Let's keep that up for the next 3 days. Focus on chewing slow.", sender: 'coach', time: '10:18 AM' }
        ];
        setMessages(welcomeSeed);
        
        // Save seed messages to database so they persist
        for (const msg of welcomeSeed) {
          await databaseService.saveChatMessage(resolvedId, msg.sender, msg.text);
        }
      }
    };
    initChat();
  }, []);

  // 2. Poll Database for New Messages (Coach replies) every 4 seconds
  useEffect(() => {
    if (!clientId) return;
    
    const fetchUpdates = async () => {
      const chatHistory = await databaseService.getChatMessages(clientId);
      if (chatHistory.length > 0) {
        setMessages(chatHistory);
      }
    };

    const interval = setInterval(fetchUpdates, 4000);
    return () => clearInterval(interval);
  }, [clientId]);

  // Scroll to bottom whenever messages list changes
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !clientId) return;
    
    const userText = input.trim();
    setInput('');

    // Save user message in DB/Storage
    const savedLogs = await databaseService.saveChatMessage(clientId, 'user', userText);
    
    // Optimistically update frontend UI
    const updatedHistory = await databaseService.getChatMessages(clientId);
    setMessages(updatedHistory.length > 0 ? updatedHistory : prev => [...prev, ...savedLogs]);

    // 3. Fallback Auto-Chatbot Replies (Only when offline/guest mode)
    const email = localStorage.getItem('userEmail');
    const isOfflineMode = !isSupabaseConfigured || !email || email.includes('guest');
    
    if (isOfflineMode) {
      setTimeout(async () => {
        const textLower = userText.toLowerCase();
        let coachResponse = "";

        if (textLower.includes("water") || textLower.includes("drink") || textLower.includes("sip") || textLower.includes("hydrate")) {
          coachResponse = "Awesome job focusing on hydration! Keep hitting our daily water target (4L). Every small sip counts, and I love appreciating your small moves! Keep that bottle filled next to you. 💧";
        } else if (textLower.includes("walk") || textLower.includes("step") || textLower.includes("stroll") || textLower.includes("cardio")) {
          coachResponse = "Yes! Walking is an absolute game-changer for insulin sensitivity and gut health. Remember our daily rule: walk for 10 minutes post lunch & dinner, and aim for a quick stroll/stretch every 30-40 minutes! post a photo when you hit 10k! 🚶‍♂️⚡";
        } else if (textLower.includes("lift") || textLower.includes("weight") || textLower.includes("deadlift") || textLower.includes("squat") || textLower.includes("gym") || textLower.includes("progressive")) {
          coachResponse = "Outstanding! Tracking your weight lifting progress and progressive overload is the primary pathway to hypertrophic success. Focus on strict form first, then load the bar safely. You can view your overload charts in the Progress tab! 🏋️‍♂️📈";
        } else if (textLower.includes("lagging") || textLower.includes("macro") || textLower.includes("protein") || textLower.includes("fat") || textLower.includes("carb") || textLower.includes("calorie") || textLower.includes("deficit")) {
          coachResponse = "Precision accountability is everything! If you are lagging on protein, lean on egg whites, breast meat, or tofu. For clean fats, grab a handful of walnuts or raw almonds. Go to the Track tab to check exactly what macros you are missing and see my custom food swaps! 🥩🥑";
        } else {
          const generalReplies = [
            "Consistency is the secret code! You are showing incredible discipline today. Keep executing your daily checklist and let's win this week! 🔥",
            "Superb focus! A healthy gut and strong muscles are built through these daily, silent victories. I'm right here with you—what is our next target? 🌟",
            "Love the accountability! Keep logging your meals, water, and workouts. Every single log makes the system smarter and keeps you aligned. Let's go! ⚡",
            "Got it! I've loaded those details into your active coaching profile. You're doing amazing—let's keep this momentum extremely high! 🚀"
          ];
          coachResponse = generalReplies[Math.floor(Math.random() * generalReplies.length)];
        }

        // Save bot response to storage
        await databaseService.saveChatMessage(clientId, 'coach', coachResponse);
        const refreshedHistory = await databaseService.getChatMessages(clientId);
        setMessages(refreshedHistory);
      }, 1500);
    }
  };

  return (
    <div className="chat-container animate-slide-up">
      <div className="chat-header">
        <div className="coach-avatar">
          <span className="emoji">🏋️‍♂️</span>
          <div className="online-indicator"></div>
        </div>
        <div className="coach-info">
          <h2>Coach Subodh</h2>
          <p>Online</p>
        </div>
      </div>
      
      <div className="messages-area">
        <div className="date-badge">Today</div>
        
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={`message-bubble ${msg.sender}`}>
            <div className="message-content">
              {msg.text}
            </div>
            <span className="message-time">{msg.time}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <button className="attach-btn">
          <span>+</span>
        </button>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Message Coach..." 
        />
        <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>
          <span>↑</span>
        </button>
      </div>
    </div>
  );
};

export default CoachChat;
